package ru.carpet.dto;

import java.math.BigDecimal;

/** price=null означает «вернуть к авто-расчёту» (сумма цен услуг позиции). */
public record UpdatePriceRequest(BigDecimal price) {}
