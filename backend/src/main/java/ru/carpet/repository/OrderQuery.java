package ru.carpet.repository;

import ru.carpet.model.OrderStatus;

import java.util.List;

/**
 * Параметры фильтрации списка заказов.
 *
 * <p>Раньше {@code findAll}/{@code countAll} принимали 12+ позиционных аргументов;
 * новый поиск (по сотруднику, по дате актуального забора и т.п.) каждый раз требовал
 * добавления параметра во все перегрузки и точки вызова. Builder-pattern даёт
 * удобный API: {@code OrderQuery.builder().statuses(...).dateFrom(...).build()}.
 *
 * <p>Все поля опциональные ({@code null} = без фильтра).
 */
public record OrderQuery(
        List<OrderStatus> statuses,
        String dateFrom,
        String dateTo,
        /**
         * По какому полю даты фильтровать (ALLOWED_DATE_FIELDS в репозитории).
         * Возможные значения: created_at | pickup_date | delivery_date |
         * actual_pickup_date | actual_delivery_date. По умолчанию — created_at.
         */
        String dateField,
        Long legacyId,
        Long orderId,
        /** CSV формата "CARD,CASH" поддерживается. */
        String paymentType,
        String clientPhone,
        String clientName,
        Long clientId,
        List<String> sortBy,
        List<String> sortDir,
        /** true = только заказы с адресом без координат (для дашборда «потерянные»). */
        Boolean noCoords,
        /**
         * true = заказы с просроченной фактической датой (actual_pickup_date или
         * actual_delivery_date в прошлом, статус активный). Для дашборда «Просрочка по факт. дате».
         */
        Boolean overdueActual,
        /**
         * true = пора забирать (FOR_PICKUP) или доставлять (DONE), но соответствующий адрес пуст.
         * Используется виджетом «Без адреса» на главной.
         */
        Boolean badAddress,
        /** V19: фильтр только по гарантийным заказам (из аналитики, клик по «Гарантийных»). */
        Boolean onlyWarranty
) {
    public static Builder builder() { return new Builder(); }

    public static OrderQuery empty() { return builder().build(); }

    public static class Builder {
        private List<OrderStatus> statuses;
        private String dateFrom;
        private String dateTo;
        private String dateField;
        private Long legacyId;
        private Long orderId;
        private String paymentType;
        private String clientPhone;
        private String clientName;
        private Long clientId;
        private List<String> sortBy;
        private List<String> sortDir;
        private Boolean noCoords;
        private Boolean overdueActual;
        private Boolean badAddress;
        private Boolean onlyWarranty;

        public Builder statuses(List<OrderStatus> v) { this.statuses = v; return this; }
        public Builder status(OrderStatus v) { this.statuses = v == null ? null : List.of(v); return this; }
        public Builder dateFrom(String v) { this.dateFrom = v; return this; }
        public Builder dateTo(String v) { this.dateTo = v; return this; }
        public Builder dateField(String v) { this.dateField = v; return this; }
        public Builder legacyId(Long v) { this.legacyId = v; return this; }
        public Builder orderId(Long v) { this.orderId = v; return this; }
        public Builder paymentType(String v) { this.paymentType = v; return this; }
        public Builder clientPhone(String v) { this.clientPhone = v; return this; }
        public Builder clientName(String v) { this.clientName = v; return this; }
        public Builder clientId(Long v) { this.clientId = v; return this; }
        public Builder sortBy(List<String> v) { this.sortBy = v; return this; }
        public Builder sortDir(List<String> v) { this.sortDir = v; return this; }
        public Builder noCoords(Boolean v) { this.noCoords = v; return this; }
        public Builder overdueActual(Boolean v) { this.overdueActual = v; return this; }
        public Builder badAddress(Boolean v) { this.badAddress = v; return this; }
        public Builder onlyWarranty(Boolean v) { this.onlyWarranty = v; return this; }

        public OrderQuery build() {
            return new OrderQuery(statuses, dateFrom, dateTo, dateField, legacyId, orderId,
                    paymentType, clientPhone, clientName, clientId, sortBy, sortDir,
                    noCoords, overdueActual, badAddress, onlyWarranty);
        }
    }
}
