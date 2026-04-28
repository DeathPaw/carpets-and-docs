package ru.carpet;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Точка входа в приложение — Система учёта заказов для производства ковров.
 */
@SpringBootApplication
public class CarpetOrderManagementApplication {

    public static void main(String[] args) {
        SpringApplication.run(CarpetOrderManagementApplication.class, args);
    }
}
