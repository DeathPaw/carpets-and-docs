package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.Client;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ClientRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<Client> ROW_MAPPER = (rs, rowNum) -> new Client(
            rs.getLong("id"),
            rs.getString("client_type"),
            rs.getString("name"),
            rs.getString("first_name"),
            rs.getString("last_name"),
            rs.getString("phone"),
            rs.getString("extra_phone"),
            rs.getString("address"),
            rs.getString("district"),
            rs.getString("inn"),
            rs.getString("contact_person"),
            rs.getString("contact_person_phone"),
            rs.getString("comment"),
            rs.getBoolean("is_pensioner"),
            rs.getBoolean("is_problem"),
            rs.getBoolean("is_regular"),
            rs.getBigDecimal("lat"),
            rs.getBigDecimal("lon"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ClientRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Client> findAll() {
        return jdbc.query("SELECT * FROM clients ORDER BY name", Map.of(), ROW_MAPPER);
    }

    public Optional<Client> findById(Long id) {
        List<Client> result = jdbc.query(
                "SELECT * FROM clients WHERE id = :id",
                Map.of("id", id), ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public Client save(String clientType, String name, String firstName, String lastName,
                       String phone, String extraPhone, String address, String district,
                       String inn, String contactPerson, String contactPersonPhone,
                       String comment, boolean isPensioner, boolean isProblem, boolean isRegular,
                       BigDecimal lat, BigDecimal lon) {
        var params = new MapSqlParameterSource()
                .addValue("clientType", clientType != null ? clientType : "INDIVIDUAL")
                .addValue("name", name)
                .addValue("firstName", firstName)
                .addValue("lastName", lastName)
                .addValue("phone", phone)
                .addValue("extraPhone", extraPhone)
                .addValue("address", address)
                .addValue("district", district)
                .addValue("inn", inn)
                .addValue("contactPerson", contactPerson)
                .addValue("contactPersonPhone", contactPersonPhone)
                .addValue("comment", comment)
                .addValue("isPensioner", isPensioner)
                .addValue("isProblem", isProblem)
                .addValue("isRegular", isRegular)
                .addValue("lat", lat)
                .addValue("lon", lon);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO clients (client_type, name, first_name, last_name, phone, extra_phone, address, district, " +
                "inn, contact_person, contact_person_phone, comment, is_pensioner, is_problem, is_regular, lat, lon) " +
                "VALUES (:clientType, :name, :firstName, :lastName, :phone, :extraPhone, :address, :district, " +
                ":inn, :contactPerson, :contactPersonPhone, :comment, :isPensioner, :isProblem, :isRegular, :lat, :lon)",
                params, keyHolder, new String[]{"id"}
        );
        return findById(keyHolder.getKey().longValue()).orElseThrow();
    }

    public Client update(Long id, String clientType, String name, String firstName, String lastName,
                         String phone, String extraPhone, String address, String district,
                         String inn, String contactPerson, String contactPersonPhone,
                         String comment, boolean isPensioner, boolean isProblem, boolean isRegular,
                         BigDecimal lat, BigDecimal lon) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("clientType", clientType != null ? clientType : "INDIVIDUAL")
                .addValue("name", name)
                .addValue("firstName", firstName)
                .addValue("lastName", lastName)
                .addValue("phone", phone)
                .addValue("extraPhone", extraPhone)
                .addValue("address", address)
                .addValue("district", district)
                .addValue("inn", inn)
                .addValue("contactPerson", contactPerson)
                .addValue("contactPersonPhone", contactPersonPhone)
                .addValue("comment", comment)
                .addValue("isPensioner", isPensioner)
                .addValue("isProblem", isProblem)
                .addValue("isRegular", isRegular)
                .addValue("lat", lat)
                .addValue("lon", lon);
        jdbc.update(
                "UPDATE clients SET client_type=:clientType, name=:name, first_name=:firstName, last_name=:lastName, " +
                "phone=:phone, extra_phone=:extraPhone, address=:address, district=:district, " +
                "inn=:inn, contact_person=:contactPerson, contact_person_phone=:contactPersonPhone, " +
                "comment=:comment, is_pensioner=:isPensioner, is_problem=:isProblem, is_regular=:isRegular, " +
                "lat=:lat, lon=:lon, " +
                "updated_at=NOW() WHERE id=:id",
                params
        );
        return findById(id).orElseThrow();
    }

    public List<Client> search(String query) {
        String likeQuery = "%" + query.toLowerCase() + "%";
        return jdbc.query(
                "SELECT * FROM clients WHERE " +
                "LOWER(name) LIKE :q OR LOWER(COALESCE(first_name,'')) LIKE :q OR LOWER(COALESCE(last_name,'')) LIKE :q " +
                "OR COALESCE(phone,'') LIKE :q OR COALESCE(extra_phone,'') LIKE :q " +
                "OR LOWER(COALESCE(address,'')) LIKE :q OR LOWER(COALESCE(contact_person,'')) LIKE :q " +
                "OR COALESCE(contact_person_phone,'') LIKE :q OR COALESCE(inn,'') LIKE :q " +
                "ORDER BY name",
                Map.of("q", likeQuery), ROW_MAPPER
        );
    }
}
