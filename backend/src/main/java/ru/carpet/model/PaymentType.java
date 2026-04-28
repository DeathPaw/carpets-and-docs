package ru.carpet.model;

/**
 * Типы оплаты заказа.
 */
public enum PaymentType {
    /** Банковский перевод */
    TRANSFER,
    /** Оплата картой */
    CARD,
    /** Наличные */
    CASH
}
