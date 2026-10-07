package ru.carpet.service;

import org.springframework.stereotype.Service;
import ru.carpet.repository.CostEntryRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * Себестоимость на метр (ТЗ v2, блок «Закупки, затраты и себестоимость»).
 *
 * <p>Затраты раскладываются на обработанные метры: удельный расход месяца =
 * отнесённая на месяц сумма / обработанные м² месяца, а затрата заказа =
 * удельный расход × его метры этого месяца. Прямые расходы (способ учёта
 * «на заказ») в общую базу не входят — иначе заказ заплатил бы за них дважды.
 *
 * <p>Затраты с периодом делятся между месяцами пропорционально календарным
 * дням, включая обе границы — как в ТЗ (пример: 61 000 ₽ на сентябрь–октябрь
 * дают 30 000 и 31 000 ₽). Доля месяца дальше делится на его фактический
 * метраж; если метров не было, доля остаётся нераспределённой.
 *
 * <p>Нулевой метраж месяца не обнуляет деньги и не переносит их молча дальше:
 * сумма показывается как нераспределённая.
 */
@Service
public class CostAllocationService {

    private final CostEntryRepository repository;
    /** ТЗ v2, блок 5: метры завершённых выездных чисток тоже в базе распределения. */
    private final ru.carpet.repository.OnsiteCleaningRepository onsiteRepository;

    public CostAllocationService(CostEntryRepository repository,
                                 ru.carpet.repository.OnsiteCleaningRepository onsiteRepository) {
        this.repository = repository;
        this.onsiteRepository = onsiteRepository;
    }

    /**
     * Строка отчёта по месяцу.
     *
     * @param meters      обработанные м² месяца
     * @param allocated   отнесённая на месяц сумма
     * @param perMeter    удельный расход, ₽/м² (0, если метров нет)
     * @param unallocated часть суммы, которую не на что распределить
     */
    public record MonthCost(
            String month,
            BigDecimal meters,
            BigDecimal allocated,
            BigDecimal perMeter,
            BigDecimal unallocated
    ) {}

    /** Себестоимость заказа: прямые расходы + доля накладных по метрам. */
    public record OrderCost(
            Long orderId,
            BigDecimal direct,
            BigDecimal allocated,
            BigDecimal total,
            List<Map<String, Object>> detail
    ) {}

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    public List<MonthCost> costPerMeter() {
        Map<String, BigDecimal> meters = new TreeMap<>(repository.metersByMonth());
        // Один физический объём учитывается один раз: ковры в цеху и выездные
        // чистки не пересекаются, поэтому метры просто складываются.
        onsiteRepository.metersByMonth().forEach((month, value) -> meters.merge(month, value, BigDecimal::add));
        Map<String, BigDecimal> allocated = new TreeMap<>(repository.monthlyAmounts());
        Map<String, BigDecimal> unallocated = new TreeMap<>();

        spreadPeriodEntries(meters, allocated, unallocated);

        Set<String> months = new TreeSet<>();
        months.addAll(meters.keySet());
        months.addAll(allocated.keySet());
        months.addAll(unallocated.keySet());

        List<MonthCost> result = new ArrayList<>();
        for (String month : months) {
            BigDecimal m = meters.getOrDefault(month, ZERO);
            BigDecimal a = allocated.getOrDefault(month, ZERO);
            BigDecimal u = unallocated.getOrDefault(month, ZERO);
            if (m.signum() == 0) {
                // Делить не на что: вся отнесённая сумма остаётся нераспределённой.
                result.add(new MonthCost(month, ZERO, a, ZERO, u.add(a)));
            } else {
                result.add(new MonthCost(month, m, a, a.divide(m, 4, RoundingMode.HALF_UP), u));
            }
        }
        return result;
    }

    /**
     * Раскидывает затраты с периодом по месяцам пропорционально календарным
     * дням внутри периода (правило ТЗ). Остаток от округления отдаём
     * последнему месяцу — сумма долей должна совпасть с исходной до копейки.
     *
     * <p>Месяц без обработанных метров свою долю всё равно получает, но она
     * идёт в нераспределённое: делить её не на что.
     */
    private void spreadPeriodEntries(Map<String, BigDecimal> meters,
                                     Map<String, BigDecimal> allocated,
                                     Map<String, BigDecimal> unallocated) {
        for (var entry : repository.periodEntries()) {
            BigDecimal amount = toDecimal(entry.get("amount"));
            LocalDate from = toDate(entry.get("alloc_from"));
            LocalDate to = toDate(entry.get("alloc_to"));
            if (amount == null || from == null || to == null) continue;

            List<String> months = monthsBetween(from, to);
            Map<String, Long> daysByMonth = new LinkedHashMap<>();
            long totalDays = 0;
            for (String month : months) {
                long days = daysInPeriod(month, from, to);
                daysByMonth.put(month, days);
                totalDays += days;
            }
            if (totalDays == 0) continue;

            BigDecimal distributed = ZERO;
            for (int i = 0; i < months.size(); i++) {
                String month = months.get(i);
                BigDecimal share = i == months.size() - 1
                        ? amount.subtract(distributed)
                        : amount.multiply(BigDecimal.valueOf(daysByMonth.get(month)))
                                .divide(BigDecimal.valueOf(totalDays), 2, RoundingMode.HALF_UP);
                distributed = distributed.add(share);
                if (meters.getOrDefault(month, ZERO).signum() > 0) {
                    allocated.merge(month, share, BigDecimal::add);
                } else {
                    unallocated.merge(month, share, BigDecimal::add);
                }
            }
        }
    }

    /** Сколько дней месяца попадает в период — обе границы включительно. */
    private static long daysInPeriod(String month, LocalDate from, LocalDate to) {
        YearMonth ym = YearMonth.parse(month);
        LocalDate start = from.isAfter(ym.atDay(1)) ? from : ym.atDay(1);
        LocalDate end = to.isBefore(ym.atEndOfMonth()) ? to : ym.atEndOfMonth();
        if (end.isBefore(start)) return 0;
        return java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1;
    }

    public OrderCost orderCost(Long orderId) {
        BigDecimal direct = repository.directAmountForOrder(orderId);
        Map<String, BigDecimal> perMeter = new HashMap<>();
        for (MonthCost mc : costPerMeter()) perMeter.put(mc.month(), mc.perMeter());

        BigDecimal allocated = ZERO;
        List<Map<String, Object>> detail = new ArrayList<>();
        for (var e : repository.orderMetersByMonth(orderId).entrySet()) {
            BigDecimal rate = perMeter.getOrDefault(e.getKey(), ZERO);
            BigDecimal sum = rate.multiply(e.getValue()).setScale(2, RoundingMode.HALF_UP);
            allocated = allocated.add(sum);
            detail.add(new LinkedHashMap<>(Map.of(
                    "month", e.getKey(),
                    "meters", e.getValue(),
                    "per_meter", rate,
                    "amount", sum
            )));
        }
        return new OrderCost(orderId, direct, allocated, direct.add(allocated), detail);
    }

    /** Месяцы периода включительно: «2026-09», «2026-10», … */
    private static List<String> monthsBetween(LocalDate from, LocalDate to) {
        List<String> months = new ArrayList<>();
        YearMonth cursor = YearMonth.from(from);
        YearMonth last = YearMonth.from(to);
        while (!cursor.isAfter(last)) {
            months.add(cursor.toString());
            cursor = cursor.plusMonths(1);
        }
        return months;
    }

    private static BigDecimal toDecimal(Object v) {
        if (v == null) return null;
        return v instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(v));
    }

    private static LocalDate toDate(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Date d) return d.toLocalDate();
        if (v instanceof LocalDate d) return d;
        return LocalDate.parse(String.valueOf(v));
    }
}
