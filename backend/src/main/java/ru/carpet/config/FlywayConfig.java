package ru.carpet.config;

import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
public class FlywayConfig {

    /**
     * Flyway с авто-repair: при изменениях контрольных сумм миграций (например, после
     * объединения миграций V1..V13 в одну baseline V1) Flyway автоматически приводит
     * flyway_schema_history к актуальному состоянию. Это позволяет переписывать V1
     * без `mvn flyway:repair` руками.
     *
     * Безопасно для свежих установок и для dev/staging. Для прод-окружения с
     * настоящими миграциями (которых ещё нет) лучше отключить repair и делать
     * аккуратные incremental migrations поверх baseline.
     */
    @Bean(initMethod = "migrate")
    public Flyway flyway(DataSource dataSource) {
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();
        // Чиним checksum'ы изменённых миграций до запуска migrate.
        try { flyway.repair(); } catch (Exception ignore) { /* пустая БД — repair не нужен */ }
        return flyway;
    }
}
