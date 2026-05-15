package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.audit.AuditUser;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.Sku;
import ru.carpet.repository.SkuRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Бизнес-логика SKU (V10).
 *
 * <p>Создание/обновление SKU + версионирование в {@link SkuRepository}.
 * Дополнительно: {@link #findMatching} — подбор SKU группы под параметры
 * конкретной позиции (item_type_id, weight, area, perimeter, length, width).
 * Используется на UI добавления услуги в заказ — те SKU, чьи атрибуты
 * совпадают, подсвечиваются как «подходящие».
 */
@Service
public class SkuService {

    private final SkuRepository repository;

    public SkuService(SkuRepository repository) {
        this.repository = repository;
    }

    public List<Sku> findAll() { return repository.findAll(false); }

    public Sku findById(Long id) {
        return repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Sku not found: " + id));
    }

    @Transactional
    public Sku create(Long groupId, String name, String pricingType, BigDecimal price,
                      BigDecimal costPrice, boolean isAutoAdd, BigDecimal freeThreshold,
                      String autoCompleteOnStatus, String triggersOrderStatus, boolean excludeFromStatusCalc,
                      Map<String, List<String>> attributes) {
        return repository.create(groupId, name, pricingType, price, costPrice, isAutoAdd, freeThreshold,
                autoCompleteOnStatus, triggersOrderStatus, excludeFromStatusCalc,
                attributes, AuditUser.current());
    }

    @Transactional
    public Sku update(Long id, Long groupId, String name, String pricingType, BigDecimal price,
                      BigDecimal costPrice, boolean isAutoAdd, BigDecimal freeThreshold,
                      String autoCompleteOnStatus, String triggersOrderStatus, boolean excludeFromStatusCalc,
                      Map<String, List<String>> attributes) {
        repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Sku not found: " + id));
        return repository.update(id, groupId, name, pricingType, price, costPrice, isAutoAdd, freeThreshold,
                autoCompleteOnStatus, triggersOrderStatus, excludeFromStatusCalc,
                attributes, AuditUser.current());
    }

    @Transactional
    public void delete(Long id) {
        repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Sku not found: " + id));
        repository.softDelete(id);
    }

    public List<Map<String, Object>> versions(Long id) { return repository.versions(id); }

    /** SKU с auto-add — для авто-добавления при создании заказа. */
    public List<Sku> findAutoAdd() { return repository.findAutoAdd(); }

    /**
     * V11: проверка — подходит ли конкретная SKU к параметрам позиции.
     */
    public boolean checkMatch(Sku sku, ru.carpet.model.OrderItem item) {
        return matches(sku, item.itemTypeId(),
                item.weight(), item.area(), item.perimeter(),
                item.length(), item.width(), item.runningMeters());
    }

    /**
     * V11: найти замену для SKU, которая перестала подходить к позиции.
     * Ищем в той же группе активную SKU, которая matches. Если несколько — первую.
     * Если ни одной — null.
     */
    public Sku findBestReplacement(Sku currentSku, ru.carpet.model.OrderItem item) {
        return repository.findAll(false).stream()
                .filter(s -> s.groupId().equals(currentSku.groupId()))
                .filter(Sku::isActive)
                .filter(s -> !s.id().equals(currentSku.id()))
                .filter(s -> checkMatch(s, item))
                .findFirst()
                .orElse(null);
    }

    /**
     * Подбор подходящих SKU из группы под параметры позиции.
     * Возвращает все SKU группы; в результате каждому проставлен флаг
     * {@code matches=true|false} в map.
     */
    public List<Map<String, Object>> findMatching(Long groupId, Long itemTypeId,
                                                   BigDecimal weight, BigDecimal area, BigDecimal perimeter,
                                                   BigDecimal length, BigDecimal width, BigDecimal runningMeters) {
        return repository.findAll(false).stream()
            .filter(s -> groupId == null || s.groupId().equals(groupId))
            .filter(Sku::isActive)
            .map(s -> Map.of(
                "sku", s,
                "matches", matches(s, itemTypeId, weight, area, perimeter, length, width, runningMeters)
            ))
            .toList();
    }

    /**
     * SKU подходит позиции, если ВСЕ его ограничения выполнены.
     * Ограничения: item_type (если задан — должен совпадать), min/max по
     * соответствующим числовым параметрам позиции.
     */
    private boolean matches(Sku s, Long itemTypeId, BigDecimal weight, BigDecimal area, BigDecimal perimeter,
                            BigDecimal length, BigDecimal width, BigDecimal runningMeters) {
        var attrs = s.attributes();

        // item_type: если задан в SKU — позиция должна быть одного из перечисленных типов.
        var allowedTypes = attrs.get("item_type");
        if (allowedTypes != null && !allowedTypes.isEmpty()) {
            if (itemTypeId == null) return false;
            if (!allowedTypes.contains(String.valueOf(itemTypeId))) return false;
        }

        // Range-проверки по числовым атрибутам.
        if (!inRange(weight,         attrs.get("weight_min"),         attrs.get("weight_max")))         return false;
        if (!inRange(area,           attrs.get("area_min"),           attrs.get("area_max")))           return false;
        if (!inRange(perimeter,      attrs.get("perimeter_min"),      attrs.get("perimeter_max")))      return false;
        if (!inRange(length,         attrs.get("length_min"),         attrs.get("length_max")))         return false;
        if (!inRange(width,          attrs.get("width_min"),          attrs.get("width_max")))          return false;
        if (!inRange(runningMeters,  attrs.get("running_meters_min"), attrs.get("running_meters_max"))) return false;

        return true;
    }

    /**
     * Range-проверка: если SKU имеет хотя бы одно из min/max, значение позиции
     * должно входить в диапазон. Если у SKU нет ни min, ни max — ограничение не
     * применяется (любое значение подходит, включая null).
     */
    private boolean inRange(BigDecimal value, List<String> minList, List<String> maxList) {
        BigDecimal min = firstNumeric(minList);
        BigDecimal max = firstNumeric(maxList);
        if (min == null && max == null) return true;             // нет ограничения
        if (value == null) return false;                          // ограничение есть, а значения нет — не подходит
        if (min != null && value.compareTo(min) < 0) return false;
        if (max != null && value.compareTo(max) > 0) return false;
        return true;
    }

    private BigDecimal firstNumeric(List<String> list) {
        if (list == null || list.isEmpty()) return null;
        try { return new BigDecimal(list.get(0)); } catch (NumberFormatException e) { return null; }
    }
}
