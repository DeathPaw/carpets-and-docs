package ru.carpet.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Контейнер для всех ответов AnalyticsController.
 *
 * <p>Раньше всё возвращалось как {@code List<Map<String,Object>>} — фронт работал
 * на строковых ключах, типобезопасности нет, рефакторинг ломает молча. Здесь —
 * явные record DTO; имена полей совпадают с теми, что отдавал raw-Map (snake_case
 * на уровне JSON через Jackson + {@link com.fasterxml.jackson.databind.PropertyNamingStrategies}).
 */
public final class AnalyticsDto {
    private AnalyticsDto() {}

    public record DistrictCount(String district, long count, BigDecimal total) {}

    public record StatusCount(String status, long count) {}

    public record TypeCount(String typeName, long count) {}

    public record EmployeeStat(String name, long servicesDone, BigDecimal totalEarned) {}

    public record MonthRevenue(String month, long ordersCount, BigDecimal revenue) {}

    public record TopClient(long clientId, String name, String clientType,
                            long ordersCount, BigDecimal totalSpent) {}

    public record MarginRow(String serviceName, long count, BigDecimal revenue, BigDecimal cost) {}

    public record WarrantyStat(long clientId, String clientName, long totalOrders,
                               long warrantyOrders, BigDecimal warrantyPercent) {}

    /**
     * Сводка для главной страницы. Поля переменные, поэтому представлены как Map —
     * на фронте есть строгий типаж в TypeScript, а добавление нового виджета не должно
     * заставлять менять Java DTO.
     */
    public record Dashboard(Map<String, Object> values) {}

    public record ProductionQueueOrder(long orderId, String clientName, String status,
                                       LocalDateTime createdAt, BigDecimal totalAmount,
                                       String pickupDistrict, String deliveryDistrict,
                                       long itemsCount, long servicesCount, long servicesDone) {}

    public record ProductionQueueItem(long itemId, long orderId, String status, String description,
                                      BigDecimal length, BigDecimal width, BigDecimal weight, BigDecimal area,
                                      String itemTypeName, String clientName, LocalDateTime orderCreatedAt,
                                      String pickupDistrict, long servicesCount, long servicesDone) {}

    public record ProductionQueueService(long serviceId, String status, BigDecimal price,
                                         String serviceName, String pricingType,
                                         long itemId, String itemDescription, String itemStatus,
                                         long itemTypeId, String itemTypeName,
                                         long orderId, String clientName, LocalDateTime orderCreatedAt,
                                         String pickupDistrict, long positionInOrder,
                                         String employeeNames, List<Integer> employeeIds) {}

    // ───── profitability ─────

    public record ProfitByItemType(long id, String name, long itemsCount,
                                   BigDecimal revenue, BigDecimal cost, BigDecimal profit, long costMissing) {}

    public record ProfitByClient(long clientId, String name, String clientType, long ordersCount,
                                 BigDecimal revenue, BigDecimal cost, BigDecimal profit) {}

    public record ProfitByEmployee(long employeeId, String name, long servicesCount,
                                   BigDecimal revenue, BigDecimal cost) {}

    public record ProfitByEmployeeService(long serviceId, String serviceName,
                                          long count, BigDecimal revenue) {}

    public record ProfitByDistrict(String district, long ordersCount,
                                   BigDecimal revenue, BigDecimal cost, BigDecimal profit) {}

    public record ProfitByOrder(long id, String clientName, String status, LocalDateTime createdAt,
                                BigDecimal revenue, BigDecimal cost, BigDecimal profit) {}
}
