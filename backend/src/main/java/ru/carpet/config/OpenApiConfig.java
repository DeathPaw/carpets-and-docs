package ru.carpet.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.Components;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Конфигурация Swagger / OpenAPI 3.0.
 *
 * <p>Документация API доступна по адресам:
 * <ul>
 *   <li>{@code /swagger-ui.html} — интерактивный UI для отладки запросов</li>
 *   <li>{@code /v3/api-docs} — JSON-спецификация для генерации клиентов</li>
 * </ul>
 *
 * <p>Для всех {@code /api/**} используется HTTP Basic auth (см. SecurityConfig).
 * Swagger UI поддерживает кнопку "Authorize" для ввода логина/пароля.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI carpetOpenAPI() {
        return new OpenAPI()
            .info(new Info()
                .title("Carpet Order Management API")
                .description("REST API системы учёта заказов для производства ковров. " +
                    "Все запросы под /api/** требуют HTTP Basic авторизацию.")
                .version("1.0.0")
                .contact(new Contact().name("Carpet Team")))
            .addSecurityItem(new SecurityRequirement().addList("basicAuth"))
            .components(new Components()
                .addSecuritySchemes("basicAuth", new SecurityScheme()
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("basic")
                    .description("HTTP Basic auth (admin / foxyisgood в dev)")));
    }
}
