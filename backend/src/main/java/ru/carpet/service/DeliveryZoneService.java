package ru.carpet.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * Зональный расчёт доставки (ПР-006) — по той же модели, что калькулятор сайта.
 *
 * <p>Зоны — полигоны из resources/delivery/delivery-zones.geojson (файл сайта).
 * Адрес относится к зоне с наибольшим priority, в которую попадает точка:
 * отдельные города (Пушкин, Мурино…) перекрывают свои районы, районы города —
 * области. Цена полного цикла (забор + отвоз) снижается от суммы стирки:
 * <ul>
 *   <li>зона 1: от 4 000 ₽ — бесплатно;</li>
 *   <li>зоны 2 и 3: от 4 000 ₽ — минус 600 ₽, от 6 000 ₽ — бесплатно;</li>
 *   <li>зона 4А: от 6 000 ₽ — минус 600 ₽, от 10 000 ₽ — бесплатно;</li>
 *   <li>зона 4Б: от 10 000 ₽ — бесплатно; цена «от» — оператор уточняет.</li>
 * </ul>
 * В заказе забор и отвоз — две позиции, каждой достаётся половина цены цикла.
 */
@Service
public class DeliveryZoneService {

    /** Зона для показа в заказе. exactPrice=false — цена «от», её надо уточнить. */
    public record ZoneInfo(String name, String zone, BigDecimal oneWay, BigDecimal fullCycle, boolean exactPrice) {}

    private record Zone(ZoneInfo info, int priority, List<List<double[][]>> polygons) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final List<Zone> zones;

    public DeliveryZoneService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.zones = load();
    }

    /** Дата, с которой заказы считаются по зонам (V61). null — зоны выключены. */
    public LocalDate activeFrom() {
        try {
            return jdbc.queryForObject("SELECT delivery_zones_from FROM company_settings WHERE id = 1",
                    Map.of(), LocalDate.class);
        } catch (Exception e) {
            return null;
        }
    }

    /** Действуют ли зоны для заказа с этой датой прайса. */
    public boolean appliesTo(LocalDate orderPriceDate) {
        LocalDate from = activeFrom();
        if (from == null) return false;
        LocalDate date = orderPriceDate == null ? LocalDate.now() : orderPriceDate;
        return !date.isBefore(from);
    }

    public Optional<ZoneInfo> find(BigDecimal lat, BigDecimal lon) {
        if (lat == null || lon == null) return Optional.empty();
        double x = lon.doubleValue(), y = lat.doubleValue();
        for (Zone z : zones) {
            for (List<double[][]> polygon : z.polygons()) {
                if (inPolygon(polygon, x, y)) return Optional.of(z.info());
            }
        }
        return Optional.empty();
    }

    /** Цена полного цикла по зоне и сумме стирки — логика калькулятора сайта. */
    public static BigDecimal fullCyclePrice(ZoneInfo zone, BigDecimal cleaning) {
        BigDecimal base = zone.fullCycle();
        double sum = cleaning == null ? 0 : cleaning.doubleValue();
        BigDecimal minus600 = base.subtract(BigDecimal.valueOf(600)).max(BigDecimal.ZERO);
        return switch (zone.zone()) {
            case "1" -> sum >= 4000 ? BigDecimal.ZERO : base;
            case "2", "3" -> sum >= 6000 ? BigDecimal.ZERO : sum >= 4000 ? minus600 : base;
            case "4А" -> sum >= 10000 ? BigDecimal.ZERO : sum >= 6000 ? minus600 : base;
            case "4Б" -> sum >= 10000 ? BigDecimal.ZERO : base;
            default -> base;
        };
    }

    /** Цена одной поездки (забор или отвоз) — половина цены цикла. */
    public static BigDecimal legPrice(ZoneInfo zone, BigDecimal cleaning) {
        return fullCyclePrice(zone, cleaning).divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
    }

    // ---------------- геометрия ----------------

    /** Точка внутри внешнего контура и вне «дыр» (остальные кольца полигона). */
    private static boolean inPolygon(List<double[][]> rings, double x, double y) {
        if (rings.isEmpty() || !inRing(rings.get(0), x, y)) return false;
        for (int i = 1; i < rings.size(); i++) {
            if (inRing(rings.get(i), x, y)) return false;
        }
        return true;
    }

    /** Ray casting. */
    private static boolean inRing(double[][] ring, double x, double y) {
        boolean inside = false;
        for (int i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            double xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    @SuppressWarnings("unchecked")
    private static List<Zone> load() {
        try (InputStream in = DeliveryZoneService.class.getResourceAsStream("/delivery/delivery-zones.geojson")) {
            if (in == null) return List.of();
            Map<String, Object> root = new ObjectMapper().readValue(in, Map.class);
            List<Zone> result = new ArrayList<>();
            for (Object f : (List<Object>) root.get("features")) {
                Map<String, Object> feature = (Map<String, Object>) f;
                Map<String, Object> p = (Map<String, Object>) feature.get("properties");
                Map<String, Object> g = (Map<String, Object>) feature.get("geometry");
                List<List<double[][]>> polygons = new ArrayList<>();
                List<Object> coords = (List<Object>) g.get("coordinates");
                if ("Polygon".equals(g.get("type"))) {
                    polygons.add(rings(coords));
                } else if ("MultiPolygon".equals(g.get("type"))) {
                    for (Object poly : coords) polygons.add(rings((List<Object>) poly));
                }
                ZoneInfo info = new ZoneInfo(
                        String.valueOf(p.get("name")),
                        String.valueOf(p.get("zone")),
                        new BigDecimal(String.valueOf(p.get("one_way"))),
                        new BigDecimal(String.valueOf(p.get("full_cycle"))),
                        !Boolean.FALSE.equals(p.get("exact_price")));
                int priority = p.get("priority") == null ? 0 : ((Number) p.get("priority")).intValue();
                result.add(new Zone(info, priority, polygons));
            }
            result.sort(Comparator.comparingInt(Zone::priority).reversed());
            return List.copyOf(result);
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось загрузить зоны доставки", e);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<double[][]> rings(List<Object> polygon) {
        List<double[][]> rings = new ArrayList<>();
        for (Object r : polygon) {
            List<Object> points = (List<Object>) r;
            double[][] ring = new double[points.size()][2];
            for (int i = 0; i < points.size(); i++) {
                List<Object> pt = (List<Object>) points.get(i);
                ring[i][0] = ((Number) pt.get(0)).doubleValue();
                ring[i][1] = ((Number) pt.get(1)).doubleValue();
            }
            rings.add(ring);
        }
        return rings;
    }
}
