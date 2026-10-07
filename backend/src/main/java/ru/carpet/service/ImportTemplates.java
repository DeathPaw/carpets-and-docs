package ru.carpet.service;

import java.util.List;
import java.util.Map;

/**
 * Схемы шаблонов Excel-обмена (ТЗ v2, блок 8).
 *
 * <p>Один источник правды на всё: по этому описанию фронт рисует сам шаблон
 * (листы, столбцы, инструкцию, примеры), и по нему же идёт проверка загруженных
 * строк. Пользователь и программист грузят через одну и ту же схему — разойтись
 * им негде.
 */
public final class ImportTemplates {

    private ImportTemplates() {}

    /** Версия шаблона. Файл другой версии отклоняется до записи. */
    public static final String VERSION = "1.0";

    public record Column(
            String key,
            String title,
            String type,          // TEXT | NUMBER | DATE | ENUM
            boolean required,
            List<String> values,  // для ENUM
            String hint
    ) {
        static Column text(String key, String title, boolean required, String hint) {
            return new Column(key, title, "TEXT", required, null, hint);
        }
        static Column number(String key, String title, boolean required, String hint) {
            return new Column(key, title, "NUMBER", required, null, hint);
        }
        static Column date(String key, String title, boolean required, String hint) {
            return new Column(key, title, "DATE", required, null, hint);
        }
        static Column enumeration(String key, String title, boolean required, List<String> values, String hint) {
            return new Column(key, title, "ENUM", required, values, hint);
        }
    }

    public record Template(
            String kind,
            String title,
            String sheet,
            String version,
            List<Column> columns,
            List<String> instructions,
            List<Map<String, Object>> examples
    ) {}

    public static final Template LEGAL_ENTITIES = new Template(
            "LEGAL_ENTITIES", "Юридические лица", "Юрлица", VERSION,
            List.of(
                    Column.text("external_id", "Внешний ID", true,
                            "Ваш идентификатор записи. По нему строка опознаётся при повторной загрузке."),
                    Column.text("name", "Наименование", true, "Как в договоре"),
                    Column.text("inn", "ИНН", false, "10 или 12 цифр"),
                    Column.text("kpp", "КПП", false, "9 цифр"),
                    Column.text("address", "Адрес", false, null),
                    Column.text("phone", "Телефон", false, null),
                    Column.text("email", "Email", false, null),
                    Column.text("contact_person", "Контактное лицо", false, null),
                    Column.text("contact_person_phone", "Телефон контакта", false, null),
                    Column.text("comment", "Комментарий", false, null)
            ),
            List.of(
                    "Заполняйте строки под шапкой листа «Юрлица». Столбцы не переименовывайте и не меняйте местами.",
                    "Внешний ID обязателен и должен быть уникален в файле. Повторная загрузка с тем же ID обновит запись.",
                    "Записи, которых нет в файле, не удаляются.",
                    "Перед сохранением система покажет создания, обновления, дубли и ошибки."
            ),
            List.of(Map.of(
                    "external_id", "UL-001", "name", "ООО «Ромашка»", "inn", "7801234567",
                    "kpp", "780101001", "address", "Санкт-Петербург, Невский пр., 1",
                    "phone", "+7 (812) 000-00-00", "email", "info@romashka.ru",
                    "contact_person", "Иванова Мария", "contact_person_phone", "+7 (911) 000-00-00"
            ))
    );

    public static final Template CONTRACTS = new Template(
            "CONTRACTS", "Контракты", "Контракты", VERSION,
            List.of(
                    Column.text("external_id", "Внешний ID", true, "Идентификатор контракта в вашей системе"),
                    Column.text("client_external_id", "Внешний ID юрлица", true,
                            "Должен существовать в системе или быть в загруженном ранее файле юрлиц"),
                    Column.text("number", "Номер контракта", true, null),
                    Column.enumeration("kind", "Вид", true, List.of("COMMERCIAL", "GOVERNMENT"),
                            "COMMERCIAL — коммерческий, GOVERNMENT — государственный"),
                    Column.date("signed_on", "Дата заключения", true, "Формат ГГГГ-ММ-ДД"),
                    Column.date("expires_on", "Дата окончания", false, "Пусто — бессрочный"),
                    Column.number("planned_sqm", "Плановый объём, м²", false, null),
                    Column.number("price_per_sqm", "Стоимость м², ₽", true, "Единый тариф на весь контракт"),
                    Column.text("comment", "Комментарий", false, null)
            ),
            List.of(
                    "Юрлицо ищется строго по внешнему ID — по названию контракт не привязывается.",
                    "Один тариф на контракт: несколько ставок внутри договора не поддерживаются.",
                    "Изменение цены контракта не пересчитывает уже учтённые заказы."
            ),
            List.of(Map.of(
                    "external_id", "CT-001", "client_external_id", "UL-001", "number", "ГК-2026/1",
                    "kind", "GOVERNMENT", "signed_on", "2026-01-15", "expires_on", "2026-12-31",
                    "planned_sqm", 1000, "price_per_sqm", 180
            ))
    );

    public static final Template PRIVATE_ORDERS = new Template(
            "PRIVATE_ORDERS", "Заказы частных клиентов", "Заказы", VERSION,
            List.of(
                    Column.text("external_id", "Внешний ID заказа", true,
                            "Строки с одинаковым ID — позиции одного заказа"),
                    Column.text("client_external_id", "Внешний ID клиента", false,
                            "Если пусто — клиент создаётся по имени и телефону из строки"),
                    Column.text("client_name", "Клиент", true, "Обязателен при создании клиента"),
                    Column.text("client_phone", "Телефон клиента", false, null),
                    Column.text("client_address", "Адрес клиента", false, null),
                    Column.enumeration("order_kind", "Тип заказа", true, List.of("DELIVERY", "SELF_PICKUP"),
                            "DELIVERY — с забором и доставкой, SELF_PICKUP — самовывоз"),
                    Column.text("pickup_address", "Адрес забора", false, "Для самовывоза не нужен"),
                    Column.date("order_date", "Дата заказа", true, "Формат ГГГГ-ММ-ДД"),
                    Column.text("item_type", "Тип изделия", true, "Название из справочника типов"),
                    Column.number("area", "Площадь, м²", false, null),
                    Column.number("weight", "Вес, кг", false, null),
                    Column.text("services", "Услуги", false,
                            "Названия услуг через точку с запятой, как в каталоге"),
                    Column.text("comment", "Комментарий", false, null)
            ),
            List.of(
                    "Одна строка — одна позиция заказа. Строки с одинаковым внешним ID заказа объединяются.",
                    "Тип изделия и услуги ищутся по точному названию из справочников — похожие названия не подбираются.",
                    "Цены считаются по действующему прайсу на дату заказа."
            ),
            List.of(
                    Map.of("external_id", "ORD-001", "client_name", "Иванов Иван Иванович",
                            "client_phone", "+7 (911) 111-11-11", "order_kind", "DELIVERY",
                            "pickup_address", "Санкт-Петербург, Победы, 10", "order_date", "2026-02-01",
                            "item_type", "Ковролин", "area", 6, "services", "Стирка ковролина"),
                    Map.of("external_id", "ORD-001", "client_name", "Иванов Иван Иванович",
                            "order_kind", "DELIVERY", "order_date", "2026-02-01",
                            "item_type", "Ковролин", "area", 3, "services", "Стирка ковролина")
            )
    );

    public static final Map<String, Template> ALL = Map.of(
            LEGAL_ENTITIES.kind(), LEGAL_ENTITIES,
            CONTRACTS.kind(), CONTRACTS,
            PRIVATE_ORDERS.kind(), PRIVATE_ORDERS
    );
}
