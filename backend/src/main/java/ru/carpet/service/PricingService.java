package ru.carpet.service;

import org.springframework.stereotype.Service;
import ru.carpet.model.OrderItem;
import ru.carpet.model.PricingType;

import java.math.BigDecimal;

@Service
public class PricingService {

    /**
     * Вычисляет стоимость услуги на основе параметров позиции заказа
     */
    public BigDecimal calculateServicePrice(BigDecimal basePrice, PricingType pricingType, OrderItem orderItem) {
        if (basePrice == null) {
            return BigDecimal.ZERO;
        }

        return switch (pricingType) {
            case FIXED -> basePrice;
            case BY_WEIGHT -> {
                if (orderItem.weight() == null) {
                    yield BigDecimal.ZERO;
                }
                yield basePrice.multiply(orderItem.weight());
            }
            case BY_AREA -> {
                if (orderItem.length() == null || orderItem.width() == null) {
                    yield BigDecimal.ZERO;
                }
                BigDecimal area = orderItem.length().multiply(orderItem.width());
                yield basePrice.multiply(area);
            }
            case BY_PERIMETER -> {
                if (orderItem.runningMeters() != null) {
                    yield basePrice.multiply(orderItem.runningMeters());
                }
                if (orderItem.length() == null || orderItem.width() == null) {
                    yield BigDecimal.ZERO;
                }
                BigDecimal perimeter = orderItem.length().add(orderItem.width()).multiply(BigDecimal.valueOf(2));
                yield basePrice.multiply(perimeter);
            }
        };
    }
}