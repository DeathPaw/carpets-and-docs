package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record CreateClientRequest(
        String clientType,
        @NotBlank String name,
        String firstName,
        String lastName,
        String phone,
        String extraPhone,
        String address,
        /** V18: номер квартиры (отдельно от адреса). */
        String apartment,
        String district,
        String inn,
        String contactPerson,
        String contactPersonPhone,
        String comment,
        Boolean isPensioner,
        Boolean isProblem,
        Boolean isRegular,
        BigDecimal lat,
        BigDecimal lon,
        /** V46 (правка №3 от 13.09): REVIVAL_BEFORE | NEW_AFTER | UNKNOWN. */
        String restartStatus,
        /** V46: код источника обращения. */
        String source,
        /** V46: расшифровка для источника «Другой». */
        String sourceNote,
        /** V47 (правка №1 от 13.09): MALE | FEMALE | UNKNOWN; пусто — угадаем по ФИО. */
        String gender,
        /** V47: возраст, если известен. */
        Integer age
) {}
