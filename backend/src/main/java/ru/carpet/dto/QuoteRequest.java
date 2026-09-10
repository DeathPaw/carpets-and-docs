package ru.carpet.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Правка №9 (09.09): предварительный расчёт стоимости без клиента и заказа.
 *
 * <p>Оператор называет «холодному» клиенту примерную цену ещё до того, как тот
 * согласился оформляться, — поэтому здесь нет ни клиента, ни адреса.
 *
 * @param items       изделия расчёта; порядок сохраняется в ответе
 * @param modifierIds скидки и надбавки из справочника модификаторов
 */
public record QuoteRequest(List<Item> items, List<Long> modifierIds) {

    /**
     * Одно изделие.
     *
     * @param mainSkuId   основная услуга; {@code null} — подобрать автоматически
     *                    по типу и размерам, как «✓ подходит» в карточке заказа
     * @param extraSkuIds дополнительные услуги сверх основной
     * @param area        площадь, если оператор задал её сам (круглый ковёр);
     *                    иначе считается как длина × ширина
     */
    public record Item(Long itemTypeId,
                       BigDecimal length, BigDecimal width, BigDecimal weight, BigDecimal area,
                       Long mainSkuId, List<Long> extraSkuIds) {}
}
