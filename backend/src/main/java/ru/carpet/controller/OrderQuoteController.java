package ru.carpet.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.carpet.dto.QuoteRequest;
import ru.carpet.dto.QuoteResponse;
import ru.carpet.service.OrderQuoteService;

/**
 * Правка №9 (09.09): предварительный калькулятор стоимости.
 *
 * <p>Отдельный контроллер, а не метод в {@link OrderController}: расчёт не
 * создаёт и не читает заказов, у него своя зависимость — {@link OrderQuoteService}.
 * Путь {@code POST /api/orders/quote} не пересекается с маршрутами заказа:
 * POST на один сегмент после /api/orders больше никто не слушает.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderQuoteController {

    private final OrderQuoteService quoteService;

    public OrderQuoteController(OrderQuoteService quoteService) {
        this.quoteService = quoteService;
    }

    @PostMapping("/quote")
    public QuoteResponse quote(@RequestBody QuoteRequest request) {
        return quoteService.quote(request);
    }
}
