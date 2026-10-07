package ru.carpet.model;

/**
 * Причина отмены заказа из справочника (V46, правка №3 от 13.09).
 *
 * <p>Раньше причина была свободным текстом: по нему нельзя было понять,
 * сколько заказов сорвалось из-за цены, а сколько — из-за сроков. Теперь
 * оператор выбирает из списка, а формулировки владелец правит сам в
 * Справочниках.
 *
 * @param requiresNote TRUE — к выбору обязательно дописать уточнение («Другая причина»)
 */
public record CancellationReason(
        Long id,
        String code,
        String name,
        boolean requiresNote,
        int sortOrder,
        boolean isActive
) {}
