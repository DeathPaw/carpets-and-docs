package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record Client(
        Long id,
        String clientType,
        String name,
        String firstName,
        String lastName,
        String phone,
        String extraPhone,
        String address,
        /** V18: номер квартиры (отдельно от address, не участвует в геокодировании). */
        String apartment,
        String district,
        String inn,
        String contactPerson,
        String contactPersonPhone,
        String comment,
        boolean isPensioner,
        boolean isProblem,
        boolean isRegular,
        BigDecimal lat,
        BigDecimal lon,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        /**
         * V46 (правка №3 от 13.09): статус относительно перезапуска —
         * REVIVAL_BEFORE (был клиентом «Возрождения»), NEW_AFTER (пришёл после
         * перезапуска), UNKNOWN. Заполняется один раз руками: истории заказов
         * до перезапуска в CRM нет, автоматика «новый/повторный» её не знает.
         */
        String restartStatus,
        /** V46: откуда клиент узнал о компании (коды — см. фронт). */
        String source,
        /** V46: расшифровка для источника «Другой». */
        String sourceNote,
        /**
         * V47 (правка №1 от 13.09): MALE | FEMALE | UNKNOWN. При заведении
         * клиента предзаполняется по отчеству, оператор может поправить.
         */
        String gender,
        /** V47: возраст, если известен. Для портрета базы по возрастным группам. */
        Integer age
) {}
