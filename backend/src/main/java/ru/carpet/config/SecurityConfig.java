package ru.carpet.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import jakarta.servlet.http.HttpServletResponse;
import ru.carpet.model.AppUser;
import ru.carpet.repository.AppUserRepository;

import java.util.List;

/**
 * V11: авторизация через таблицу {@code users} в БД.
 *
 * <p>При первом старте (таблица {@code users} пуста) создаёт дефолтного
 * суперпользователя из {@code app.admin.username / password} в application.yml.
 * После этого управление пользователями — через UI (страница «Пользователи»).
 *
 * <p>Роли из БД ({@code SUPERVISOR}, {@code ADMIN}, {@code OPERATOR}, {@code READONLY})
 * маппятся в Spring Security authorities: {@code ROLE_SUPERVISOR}, {@code ROLE_ADMIN} и т.д.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.admin.username:admin}")
    private String defaultUsername;

    @Value("${app.admin.password:foxy}")
    private String defaultPassword;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // Роли проверяем на сервере, а не только скрытием пунктов меню: раньше
            // любой вошедший мог дёрнуть API зарплат или пользователей напрямую.
            // Правила повторяют RequireSupervisor/RequireAdmin из App.tsx; справочники
            // читают все (они нужны в заказах), а меняют только админы.
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/worker/**").permitAll()
                // ПР-016: отчёты и зарплата — супервизору или по галочкам у пользователя.
                .requestMatchers("/api/reports/**").hasAnyAuthority("ROLE_SUPERVISOR", "PERM_REPORTS")
                .requestMatchers(HttpMethod.GET, "/api/payroll/**")
                    .hasAnyAuthority("ROLE_SUPERVISOR", "PERM_PAYROLL_VIEW", "PERM_PAYROLL_SHIFTS", "PERM_PAYROLL_EDIT")
                // Правка табеля и пересчёт по нему (пересчёт только применяет правила, ручных сумм не трогает).
                .requestMatchers("/api/payroll/shifts/**", "/api/payroll/shifts", "/api/payroll/recalculate")
                    .hasAnyAuthority("ROLE_SUPERVISOR", "PERM_PAYROLL_SHIFTS", "PERM_PAYROLL_EDIT")
                .requestMatchers("/api/payroll/**").hasAnyAuthority("ROLE_SUPERVISOR", "PERM_PAYROLL_EDIT")
                // Разделы супервизора — целиком, включая чтение.
                .requestMatchers("/api/users/**", "/api/audit-log/**", "/api/error-log/**",
                        "/api/cost-entries/**", "/api/expenses/**", "/api/analytics/profit/**")
                    .hasRole("SUPERVISOR")
                .requestMatchers("/api/import/**").hasAnyRole("SUPERVISOR", "ADMIN")
                // Служебные запросы, которые шлёт интерфейс у любого пользователя.
                .requestMatchers("/api/presence/**", "/api/notifications/**").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/feedback").authenticated()
                // Привязка заказа к контракту и сдача — работа оператора в карточке заказа.
                .requestMatchers("/api/contracts/orders/**", "/api/contracts/*/orders/**")
                    .hasAnyRole("SUPERVISOR", "ADMIN", "OPERATOR")
                // Справочники и админ-разделы: менять могут только админы.
                .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                .requestMatchers("/api/attribute-definitions/**", "/api/cancellation-reasons/**",
                        "/api/districts/**", "/api/employees/**", "/api/employee-roles/**",
                        "/api/item-types/**", "/api/price-modifiers/**", "/api/skus/**",
                        "/api/sku-groups/**", "/api/update-banners/**", "/api/company-settings/**",
                        "/api/contracts/**", "/api/feedback/**")
                    .hasAnyRole("SUPERVISOR", "ADMIN")
                // Остальные изменения — всем, кроме роли «только просмотр».
                .requestMatchers("/api/**").hasAnyRole("SUPERVISOR", "ADMIN", "OPERATOR")
                .anyRequest().permitAll()
            )
            .httpBasic(basic -> basic
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/json");
                    response.getWriter().write(
                        "{\"error\":\"Unauthorized\",\"message\":\"Требуется авторизация\"}");
                })
            );
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    /**
     * UserDetailsService читает из таблицы {@code users}. Если таблица пуста —
     * сидит дефолтного суперпользователя из application.yml (один раз).
     */
    @Bean
    public UserDetailsService userDetailsService(AppUserRepository userRepo, PasswordEncoder encoder) {
        // Seed default user if table is empty
        if (userRepo.count() == 0) {
            userRepo.create(defaultUsername, encoder.encode(defaultPassword),
                    "Администратор", "SUPERVISOR", null);
        }
        return username -> {
            AppUser appUser = userRepo.findByUsername(username)
                    .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
            // ПР-016: роль плюс выборочные права (PERM_REPORTS, PERM_PAYROLL_*).
            List<SimpleGrantedAuthority> authorities = new java.util.ArrayList<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_" + appUser.role()));
            for (String p : appUser.permissions()) authorities.add(new SimpleGrantedAuthority("PERM_" + p));
            return new User(appUser.username(), appUser.passwordHash(), authorities);
        };
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
