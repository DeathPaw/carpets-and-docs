package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.audit.AuditUser;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.model.PayScheme;
import ru.carpet.repository.PayrollRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * Расчёт ФОТ (ТЗ v2, блоки 3 и 4).
 *
 * <p>Автоматика опирается на факты, которые система и так знает: завершённый
 * ковёр с площадью и бригадой, назначенные водителю точки, смены в табеле.
 * Каждое начисление — отдельная строка со ссылкой на источник, поэтому
 * повторный пересчёт обновляет строку, а не плодит дубли.
 *
 * <p>Ручные правки оператора переживают пересчёт: сумма остаётся его, а рядом
 * хранится пересчитанное автоматическое значение — расхождение видно в ведомости.
 */
@Service
public class PayrollService {

    private final PayrollRepository repository;
    private final AuditLogService auditLogService;
    /** ТЗ v2, блок 5: выездные чистки оплачиваются по тем же правилам. */
    private final ru.carpet.repository.OnsiteCleaningRepository onsiteRepository;

    public PayrollService(PayrollRepository repository, AuditLogService auditLogService,
                          ru.carpet.repository.OnsiteCleaningRepository onsiteRepository) {
        this.repository = repository;
        this.auditLogService = auditLogService;
        this.onsiteRepository = onsiteRepository;
    }

    private static final BigDecimal ZERO = BigDecimal.ZERO;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /**
     * Округление начисления до 100 ₽ (ТЗ, блок 4): математическое, половина
     * вверх. Применяется один раз к месячному итогу сотрудника, промежуточные
     * суммы не округляются. 105 → 100, 125 → 100, 150 → 200, 151 → 200.
     */
    public static BigDecimal roundToHundred(BigDecimal value) {
        if (value == null) return ZERO;
        return value.divide(HUNDRED, 4, RoundingMode.HALF_UP)
                .add(new BigDecimal("0.5"))
                .setScale(0, RoundingMode.FLOOR)
                .multiply(HUNDRED);
    }

    // ------------------------------------------------------------------
    // Пересчёт месяца
    // ------------------------------------------------------------------

    @Transactional
    public Map<String, Object> recalculateMonth(String yearMonth) {
        var month = repository.month(yearMonth);
        if (Boolean.TRUE.equals(month.get("closed"))) {
            throw new BusinessRuleException("Ведомость за " + yearMonth + " закрыта — пересчёт запрещён.");
        }

        List<Long> aliveItemEntries = new ArrayList<>();
        int itemsProcessed = 0;

        // ---- сдельная работа и смены стирщиков ----
        for (var item : repository.completedItems(yearMonth)) {
            Long itemId = ((Number) item.get("id")).longValue();
            BigDecimal area = (BigDecimal) item.get("area");
            LocalDate completedOn = ((java.sql.Date) item.get("completed_on")).toLocalDate();
            List<Long> employeeIds = employeeIds(item.get("employee_ids"));
            if (employeeIds.isEmpty() || area == null) continue;
            itemsProcessed++;

            var shares = resolveShares(itemId, employeeIds, yearMonth);
            for (var share : shares.entrySet()) {
                Long employeeId = share.getKey();
                BigDecimal percent = share.getValue();
                PayScheme scheme = repository.schemeAt(employeeId, completedOn).orElse(null);
                if (scheme == null) continue;

                if ("SALARY".equals(scheme.scheme())) {
                    // Окладнику сдельного не начисляем, но день работы отмечаем сменой.
                    repository.ensureShift(employeeId, completedOn, "AUTO", "обработка ковра", "system");
                    continue;
                }
                if (!"PIECEWORK".equals(scheme.scheme())) continue;

                BigDecimal rate = scheme.ratePerSqm() == null ? ZERO : scheme.ratePerSqm();
                BigDecimal amount = area.multiply(rate)
                        .multiply(percent).divide(HUNDRED, 2, RoundingMode.HALF_UP);
                repository.upsertAutoEntry(employeeId, yearMonth, completedOn, "PIECEWORK",
                        "ITEM", itemId, amount,
                        String.format("%s: %s м² × %s ₽/м² × %s%%",
                                item.get("item_name"), plain(area), plain(rate), plain(percent)));
                aliveItemEntries.add(itemId);
            }
        }
        repository.deleteOrphanAutoEntries(yearMonth, "ITEM", aliveItemEntries);

        // ---- выездные чистки: те же сделка и смены ----
        List<Long> aliveOnsite = new ArrayList<>();
        for (var cleaning : onsiteRepository.completed(yearMonth)) {
            Long cleaningId = ((Number) cleaning.get("id")).longValue();
            BigDecimal area = (BigDecimal) cleaning.get("area");
            LocalDate completedOn = ((java.sql.Date) cleaning.get("completed_on")).toLocalDate();
            if (area == null) continue;

            var workers = onsiteRepository.workers(cleaningId);
            for (var w : workers) {
                Long employeeId = ((Number) w.get("employee_id")).longValue();
                BigDecimal percent = new BigDecimal(String.valueOf(w.get("percent")));
                PayScheme scheme = repository.schemeAt(employeeId, completedOn).orElse(null);
                if (scheme == null) continue;

                if ("SALARY".equals(scheme.scheme())) {
                    repository.ensureShift(employeeId, completedOn, "AUTO", "выездная чистка", "system");
                    continue;
                }
                if (!"PIECEWORK".equals(scheme.scheme())) continue;

                BigDecimal rate = scheme.ratePerSqm() == null ? ZERO : scheme.ratePerSqm();
                BigDecimal amount = area.multiply(rate)
                        .multiply(percent).divide(HUNDRED, 2, RoundingMode.HALF_UP);
                repository.upsertAutoEntry(employeeId, yearMonth, completedOn, "PIECEWORK",
                        "ONSITE", cleaningId, amount,
                        String.format("выезд к «%s»: %s м² × %s ₽/м² × %s%%",
                                cleaning.get("client_name"), plain(area), plain(rate), plain(percent)));
                aliveOnsite.add(cleaningId);
            }
        }
        repository.deleteOrphanAutoEntries(yearMonth, "ONSITE", aliveOnsite);

        // ---- водители: точки и смены ----
        Map<Long, Map<LocalDate, Integer>> pointsByEmployee = new LinkedHashMap<>();
        for (var p : repository.driverPoints(yearMonth, null)) {
            Long employeeId = ((Number) p.get("employee_id")).longValue();
            pointsByEmployee.computeIfAbsent(employeeId, k -> repository.pointsByDay(k, yearMonth));
        }
        List<Long> alivePointDays = new ArrayList<>();
        List<Long> aliveShiftDays = new ArrayList<>();
        for (var e : pointsByEmployee.entrySet()) {
            Long employeeId = e.getKey();
            for (var day : e.getValue().entrySet()) {
                LocalDate date = day.getKey();
                int points = day.getValue();
                PayScheme scheme = repository.schemeAt(employeeId, date).orElse(null);
                if (scheme == null) continue;
                long dayKey = dayKey(date);

                if ("DRIVER_POINTS".equals(scheme.scheme())) {
                    BigDecimal rate = scheme.pointRate() == null ? ZERO : scheme.pointRate();
                    BigDecimal amount = rate.multiply(BigDecimal.valueOf(points));
                    repository.upsertAutoEntry(employeeId, yearMonth, date, "POINTS",
                            "POINTS_DAY", dayKey, amount,
                            points + " точ. × " + plain(rate) + " ₽");
                    alivePointDays.add(dayKey);
                } else if ("DRIVER_SHIFT".equals(scheme.scheme())) {
                    // Назначенные точки формируют одну смену за день, сколько бы их ни было.
                    repository.ensureShift(employeeId, date, "AUTO", "точки водителя", "system");
                    BigDecimal fix = scheme.shiftFix() == null ? ZERO : scheme.shiftFix();
                    int included = scheme.pointsIncluded() == null ? 0 : scheme.pointsIncluded();
                    BigDecimal extraRate = scheme.extraPointRate() == null ? ZERO : scheme.extraPointRate();
                    int extraPoints = Math.max(0, points - included);
                    BigDecimal amount = fix.add(extraRate.multiply(BigDecimal.valueOf(extraPoints)));
                    repository.upsertAutoEntry(employeeId, yearMonth, date, "SHIFT",
                            "SHIFT_DAY", dayKey, amount,
                            points + " точ.: смена " + plain(fix) + " ₽"
                                    + (extraPoints > 0 ? " + " + extraPoints + " × " + plain(extraRate) + " ₽" : ""));
                    aliveShiftDays.add(dayKey);
                }
            }
        }
        repository.deleteOrphanAutoEntries(yearMonth, "POINTS_DAY", alivePointDays);
        repository.deleteOrphanAutoEntries(yearMonth, "SHIFT_DAY", aliveShiftDays);

        // ---- оклад ----
        Integer normDays = (Integer) month.get("norm_days");
        List<String> warnings = new ArrayList<>();
        List<Long> aliveSalaryMonths = new ArrayList<>();
        for (var emp : repository.employeesWithSchemes(yearMonth)) {
            Long employeeId = ((Number) emp.get("id")).longValue();
            LocalDate lastDay = YearMonth.parse(yearMonth).atEndOfMonth();
            PayScheme scheme = repository.schemeAt(employeeId, lastDay).orElse(null);
            if (scheme == null || !"SALARY".equals(scheme.scheme())) continue;

            int shifts = repository.countShifts(employeeId, yearMonth);
            if (normDays == null || normDays <= 0) {
                // Делить на ноль нельзя: показываем это как задачу оператору, а не как 0 ₽.
                warnings.add("Не задана норма рабочих дней — оклад «" + emp.get("name") + "» не рассчитан");
                continue;
            }
            BigDecimal salary = scheme.salary() == null ? ZERO : scheme.salary();
            BigDecimal amount = salary.divide(BigDecimal.valueOf(normDays), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(shifts))
                    .setScale(2, RoundingMode.HALF_UP);
            long monthKey = Long.parseLong(yearMonth.replace("-", ""));
            repository.upsertAutoEntry(employeeId, yearMonth, lastDay, "SALARY",
                    "MONTH", monthKey, amount,
                    "оклад " + plain(salary) + " ₽ / " + normDays + " дн. × " + shifts + " смен");
            aliveSalaryMonths.add(monthKey);
        }
        repository.deleteOrphanAutoEntries(yearMonth, "MONTH", aliveSalaryMonths);

        auditLogService.log("PAYROLL", null, "UPDATE",
                "Пересчитана ведомость за " + yearMonth + ": ковров " + itemsProcessed);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("year_month", yearMonth);
        result.put("items", itemsProcessed);
        result.put("warnings", warnings);
        return result;
    }

    /**
     * Доли участников за ковёр. Ручные доли не трогаем; иначе применяем
     * правило месяца: поровну между фактическими участниками либо заданные
     * проценты — последние применимы, только если состав совпал и сумма 100%.
     */
    private Map<Long, BigDecimal> resolveShares(Long itemId, List<Long> employeeIds, String yearMonth) {
        if (repository.hasManualShares(itemId)) {
            Map<Long, BigDecimal> manual = new LinkedHashMap<>();
            for (var s : repository.itemShares(itemId)) {
                manual.put(((Number) s.get("employee_id")).longValue(),
                        new BigDecimal(String.valueOf(s.get("percent"))));
            }
            return manual;
        }

        var rule = repository.shareRule(yearMonth).orElse(null);
        String mode = rule == null ? "EQUAL" : String.valueOf(rule.get("mode"));
        Map<Long, BigDecimal> shares = new LinkedHashMap<>();

        if ("PERCENT".equals(mode)) {
            Long ruleId = ((Number) rule.get("id")).longValue();
            Map<Long, BigDecimal> configured = new LinkedHashMap<>();
            BigDecimal sum = ZERO;
            for (var m : repository.shareRuleMembers(ruleId)) {
                BigDecimal pct = new BigDecimal(String.valueOf(m.get("percent")));
                configured.put(((Number) m.get("employee_id")).longValue(), pct);
                sum = sum.add(pct);
            }
            boolean sameTeam = configured.keySet().containsAll(employeeIds)
                    && employeeIds.containsAll(configured.keySet());
            if (sameTeam && sum.compareTo(HUNDRED) == 0) {
                shares.putAll(configured);
            }
        }

        if (shares.isEmpty()) {
            // По умолчанию и при несовпавшем составе — поровну между фактическими участниками.
            // Пять знаков: на троих это 33.33333 %, и сдельная сумма за ковёр
            // 3 м² по 300 ₽/м² выходит ровно 300 ₽, как в приёмочном тесте ТЗ.
            BigDecimal each = HUNDRED.divide(BigDecimal.valueOf(employeeIds.size()), 5, RoundingMode.HALF_UP);
            BigDecimal distributed = ZERO;
            for (int i = 0; i < employeeIds.size(); i++) {
                BigDecimal pct = i == employeeIds.size() - 1 ? HUNDRED.subtract(distributed) : each;
                distributed = distributed.add(pct);
                shares.put(employeeIds.get(i), pct);
            }
            mode = "EQUAL";
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (var s : shares.entrySet()) {
            rows.add(Map.of("employee_id", s.getKey(), "percent", s.getValue()));
        }
        repository.replaceItemShares(itemId, rows, mode, "AUTO");
        return shares;
    }

    /**
     * Приводит точки водителя в соответствие с заказом (ТЗ, блок 3).
     *
     * <p>Один забор или один отвоз — одна точка. Перенос дня, снятие даты и
     * смена водителя обновляют запись, а не создают вторую; у отменённого
     * заказа точек нет вовсе.
     */
    @Transactional
    public void syncOrderPoints(Long orderId) {
        var order = repository.orderLegs(orderId).orElse(null);
        if (order == null) return;

        Object driverRaw = order.get("assigned_driver_id");
        Long driverId = driverRaw == null ? null : ((Number) driverRaw).longValue();
        boolean cancelled = "CANCELLED".equals(String.valueOf(order.get("status")));

        syncLeg(orderId, "PICKUP", driverId, date(order.get("actual_pickup_date")), cancelled);
        syncLeg(orderId, "DELIVERY", driverId, date(order.get("actual_delivery_date")), cancelled);
    }

    private void syncLeg(Long orderId, String leg, Long driverId, LocalDate date, boolean cancelled) {
        if (cancelled || driverId == null || date == null) {
            repository.deleteDriverPoint(orderId, leg);
            return;
        }
        repository.upsertDriverPoint(orderId, leg, driverId, date, AuditUser.current());
    }

    private static LocalDate date(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Date d) return d.toLocalDate();
        if (v instanceof LocalDate d) return d;
        return LocalDate.parse(String.valueOf(v));
    }

    // ------------------------------------------------------------------
    // Ведомость
    // ------------------------------------------------------------------

    /** Строка месячной ведомости по сотруднику. */
    public record SheetRow(
            Long employeeId,
            String employeeName,
            String scheme,
            Integer normDays,
            int shifts,
            int points,
            BigDecimal meters,
            BigDecimal autoAmount,
            BigDecimal corrections,
            BigDecimal beforeRounding,
            BigDecimal rounded,
            BigDecimal roundingDiff
    ) {}

    public Map<String, Object> sheet(String yearMonth) {
        var month = repository.month(yearMonth);
        Integer normDays = (Integer) month.get("norm_days");
        var entries = repository.entries(yearMonth, null);

        Map<Long, List<Map<String, Object>>> byEmployee = new LinkedHashMap<>();
        for (var e : entries) {
            byEmployee.computeIfAbsent(((Number) e.get("employee_id")).longValue(), k -> new ArrayList<>()).add(e);
        }

        List<SheetRow> rows = new ArrayList<>();
        BigDecimal totalRounded = ZERO;
        BigDecimal totalDiff = ZERO;

        for (var emp : repository.employeesWithSchemes(yearMonth)) {
            Long employeeId = ((Number) emp.get("id")).longValue();
            var list = byEmployee.getOrDefault(employeeId, List.of());
            PayScheme scheme = repository.schemeAt(employeeId, YearMonth.parse(yearMonth).atEndOfMonth())
                    .orElse(null);

            BigDecimal auto = ZERO, total = ZERO;
            for (var e : list) {
                BigDecimal amount = new BigDecimal(String.valueOf(e.get("amount")));
                Object autoRaw = e.get("auto_amount");
                BigDecimal autoAmount = autoRaw == null ? ZERO : new BigDecimal(String.valueOf(autoRaw));
                auto = auto.add(autoAmount);
                total = total.add(amount);
            }
            BigDecimal rounded = roundToHundred(total);
            BigDecimal diff = rounded.subtract(total);
            totalRounded = totalRounded.add(rounded);
            totalDiff = totalDiff.add(diff);

            rows.add(new SheetRow(
                    employeeId,
                    String.valueOf(emp.get("name")),
                    scheme == null ? null : scheme.scheme(),
                    normDays,
                    repository.countShifts(employeeId, yearMonth),
                    repository.pointsByDay(employeeId, yearMonth).values().stream().mapToInt(Integer::intValue).sum(),
                    metersOf(list),
                    auto,
                    total.subtract(auto),
                    total,
                    rounded,
                    diff
            ));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("year_month", yearMonth);
        result.put("norm_days", normDays);
        result.put("closed", month.getOrDefault("closed", false));
        result.put("rows", rows);
        result.put("total_payroll", totalRounded);
        result.put("rounding_diff", totalDiff);
        return result;
    }

    /** Метры сотрудника за месяц — из деталей сдельных строк ведомости. */
    private BigDecimal metersOf(List<Map<String, Object>> entries) {
        BigDecimal meters = ZERO;
        for (var e : entries) {
            if (!"PIECEWORK".equals(e.get("kind"))) continue;
            String details = String.valueOf(e.get("details"));
            var matcher = java.util.regex.Pattern.compile("([0-9]+(?:[.,][0-9]+)?) м²").matcher(details);
            if (matcher.find()) meters = meters.add(new BigDecimal(matcher.group(1).replace(',', '.')));
        }
        return meters;
    }

    @Transactional
    public void closeMonth(String yearMonth, boolean closed) {
        repository.setClosed(yearMonth, closed, AuditUser.current());
        auditLogService.log("PAYROLL", null, closed ? "DEACTIVATE" : "ACTIVATE",
                "Ведомость за " + yearMonth + (closed ? " закрыта" : " открыта заново"));
    }

    private static List<Long> employeeIds(Object raw) {
        List<Long> ids = new ArrayList<>();
        if (raw instanceof java.sql.Array array) {
            try {
                Object[] values = (Object[]) array.getArray();
                for (Object v : values) if (v != null) ids.add(((Number) v).longValue());
            } catch (Exception ignored) { /* пустой массив — некому начислять */ }
        }
        return ids;
    }

    private static long dayKey(LocalDate date) {
        return Long.parseLong(date.toString().replace("-", ""));
    }

    private static String plain(BigDecimal v) {
        return v == null ? "0" : v.stripTrailingZeros().toPlainString();
    }
}
