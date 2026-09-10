package ru.carpet.service;

import org.springframework.stereotype.Service;
import ru.carpet.dto.QuoteRequest;
import ru.carpet.dto.QuoteResponse;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.ItemType;
import ru.carpet.model.OrderItem;
import ru.carpet.model.PriceModifier;
import ru.carpet.model.Sku;
import ru.carpet.repository.ItemTypeRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Правка №9 (09.09): предварительный расчёт стоимости без клиента и заказа.
 *
 * <p>Ничего не сохраняет. Повторяет ровно ту арифметику, по которой считается
 * настоящий заказ, — иначе цифра, названная клиенту по телефону, разошлась бы
 * с заказом, созданным из этого же расчёта:
 * <ul>
 *   <li>цена услуги — {@link PricingHelper#calculate} от размеров изделия;</li>
 *   <li>забор и доставка — auto-add SKU; бесплатны, если сумма изделий
 *       достигла {@code free_threshold} (как в {@code OrderService#recalculateDefaultItemPrices});</li>
 *   <li>модификатор — процент от базы, округлённый до копеек;</li>
 *   <li>итог — вниз до сотни ({@link OrderService#roundDownToHundred}).</li>
 * </ul>
 */
@Service
public class OrderQuoteService {

    /** Защита от случайной «простыни»: столько ковров в одном звонке не бывает. */
    private static final int MAX_ITEMS = 50;

    private final SkuService skuService;
    private final PriceModifierService modifierService;
    private final ItemTypeRepository itemTypeRepository;

    public OrderQuoteService(SkuService skuService, PriceModifierService modifierService,
                             ItemTypeRepository itemTypeRepository) {
        this.skuService = skuService;
        this.modifierService = modifierService;
        this.itemTypeRepository = itemTypeRepository;
    }

    public QuoteResponse quote(QuoteRequest request) {
        List<QuoteRequest.Item> input = request.items() == null ? List.of() : request.items();
        if (input.size() > MAX_ITEMS) {
            throw new BusinessRuleException("В расчёте не больше " + MAX_ITEMS + " изделий");
        }
        List<String> warnings = new ArrayList<>();
        List<Sku> catalog = skuService.findAll();
        Map<Long, Sku> skuById = catalog.stream().collect(Collectors.toMap(Sku::id, Function.identity()));

        List<QuoteResponse.ItemResult> items = new ArrayList<>();
        BigDecimal goods = BigDecimal.ZERO;
        for (int i = 0; i < input.size(); i++) {
            QuoteResponse.ItemResult result = quoteItem(i + 1, input.get(i), catalog, skuById, warnings);
            items.add(result);
            goods = goods.add(result.price());
        }

        // Обязательные позиции — те же auto-add SKU, что добавятся в заказ при создании.
        List<QuoteResponse.Line> logistics = new ArrayList<>();
        BigDecimal logisticsSum = BigDecimal.ZERO;
        BigDecimal freeThreshold = null;
        List<Sku> autoSkus = new ArrayList<>(skuService.findAutoAdd());
        autoSkus.sort(Comparator.comparing(Sku::id));
        for (Sku sku : autoSkus) {
            BigDecimal full = nz(sku.price());
            boolean free = sku.freeThreshold() != null && goods.compareTo(sku.freeThreshold()) >= 0;
            BigDecimal price = free ? BigDecimal.ZERO : full;
            if (sku.freeThreshold() != null) {
                freeThreshold = freeThreshold == null ? sku.freeThreshold() : freeThreshold.max(sku.freeThreshold());
            }
            logistics.add(new QuoteResponse.Line(sku.id(), sku.name(), sku.pricingType(), full, price, free, true));
            logisticsSum = logisticsSum.add(price);
        }
        BigDecimal base = goods.add(logisticsSum);

        List<QuoteResponse.ModifierLine> modifiers = new ArrayList<>();
        BigDecimal modifiersSum = BigDecimal.ZERO;
        List<Long> modifierIds = request.modifierIds() == null ? List.of() : request.modifierIds();
        for (Long id : new LinkedHashSet<>(modifierIds)) {
            if (id == null) continue;
            PriceModifier m;
            try {
                m = modifierService.findById(id);
            } catch (EntityNotFoundException e) {
                warnings.add("Скидка или надбавка #" + id + " удалена из справочника — не учтена");
                continue;
            }
            // Как OrderService#recalculateTotalWithModifiers: процент от базы, до копеек.
            BigDecimal amount = base.multiply(m.percent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            modifiers.add(new QuoteResponse.ModifierLine(m.id(), m.name(), m.percent(), amount));
            modifiersSum = modifiersSum.add(amount);
        }

        BigDecimal beforeRounding = base.add(modifiersSum).setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = OrderService.roundDownToHundred(beforeRounding);
        return new QuoteResponse(items, logistics, modifiers,
                goods.setScale(2, RoundingMode.HALF_UP), base.setScale(2, RoundingMode.HALF_UP),
                modifiersSum, total.subtract(beforeRounding), total, freeThreshold, warnings);
    }

    private QuoteResponse.ItemResult quoteItem(int position, QuoteRequest.Item in, List<Sku> catalog,
                                               Map<Long, Sku> skuById, List<String> warnings) {
        if (in == null || in.itemTypeId() == null) {
            return new QuoteResponse.ItemResult(null, null, null, List.of(), BigDecimal.ZERO);
        }
        Optional<ItemType> type = itemTypeRepository.findById(in.itemTypeId());
        if (type.isEmpty()) {
            warnings.add("Изделие " + position + ": такого типа больше нет в справочнике");
            return new QuoteResponse.ItemResult(in.itemTypeId(), null, null, List.of(), BigDecimal.ZERO);
        }
        String typeName = type.get().name();
        // Площадь — как при вводе размеров в карточке заказа: длина × ширина,
        // если оператор не задал её сам (круглые и овальные ковры).
        BigDecimal area = in.area();
        if (area == null && in.length() != null && in.width() != null) {
            area = in.length().multiply(in.width()).setScale(2, RoundingMode.HALF_UP);
        }
        OrderItem probe = new OrderItem(null, null, in.itemTypeId(), typeName, null, null, null,
                BigDecimal.ZERO, in.length(), in.width(), in.weight(), area, null, null, null, null, null);

        LinkedHashSet<Long> skuIds = new LinkedHashSet<>();
        if (in.mainSkuId() != null) {
            skuIds.add(in.mainSkuId());
        } else {
            defaultSku(catalog, probe).ifPresent(s -> skuIds.add(s.id()));
        }
        if (in.extraSkuIds() != null) skuIds.addAll(in.extraSkuIds());
        if (skuIds.isEmpty()) {
            warnings.add("Изделие " + position + " (" + typeName + "): в каталоге нет услуги для этого типа");
        }

        List<QuoteResponse.Line> services = new ArrayList<>();
        BigDecimal price = BigDecimal.ZERO;
        for (Long skuId : skuIds) {
            Sku sku = skuId == null ? null : skuById.get(skuId);
            if (sku == null || !sku.isActive()) {
                warnings.add("Изделие " + position + ": услуга #" + skuId + " недоступна");
                continue;
            }
            // Без нужного размера цена по BY_* вышла бы равной базовой ставке
            // («480 ₽» за ковёр неизвестной площади) — клиенту такую цифру называть нельзя.
            String missing = PricingHelper.checkDimensions(sku.pricingType(), probe);
            BigDecimal linePrice = BigDecimal.ZERO;
            if (missing != null) {
                warnings.add("Изделие " + position + " (" + typeName + "): укажите " + missing);
            } else {
                linePrice = PricingHelper.calculate(sku.price(), sku.pricingType(), probe)
                        .setScale(2, RoundingMode.HALF_UP);
            }
            services.add(new QuoteResponse.Line(sku.id(), sku.name(), sku.pricingType(),
                    nz(sku.price()), linePrice, false, skuService.checkMatch(sku, probe)));
            price = price.add(linePrice);
        }
        return new QuoteResponse.ItemResult(in.itemTypeId(), typeName, area, services, price);
    }

    /**
     * Основная услуга по умолчанию — SKU, у которого в атрибуте item_type есть этот
     * тип. Подходящая по размерам (тарифная сетка по площади/весу) — первой.
     */
    private Optional<Sku> defaultSku(List<Sku> catalog, OrderItem probe) {
        String typeId = String.valueOf(probe.itemTypeId());
        return catalog.stream()
                .filter(Sku::isActive)
                .filter(s -> !s.isAutoAdd())
                .filter(s -> {
                    List<String> types = s.attributes().get("item_type");
                    return types != null && types.contains(typeId);
                })
                .min(Comparator.comparing((Sku s) -> !skuService.checkMatch(s, probe)).thenComparing(Sku::id));
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
