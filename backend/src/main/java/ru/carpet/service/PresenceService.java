package ru.carpet.service;

import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Кто из пользователей сейчас открыл какой заказ — для подавления уведомлений
 * (если оператор глядит на страницу заказа, бессмысленно слать ему «у заказа
 * сменился статус», он сам всё видит).
 *
 * <p>Хранится в памяти, heartbeat от фронта раз в 15 сек, протухает за 30 сек.
 * Без БД и Redis — на одном процессе достаточно. Если будут несколько инстансов
 * бэка, придётся переехать на Redis pub-sub (для масштаба — отдельная задача).
 */
@Service
public class PresenceService {

    /** userId → {orderId → expiresAtMillis}. */
    private final ConcurrentHashMap<Long, ConcurrentHashMap<Long, Long>> map = new ConcurrentHashMap<>();

    private static final long TTL_MS = 30_000;

    /** Фронт пингует это раз в 15 секунд пока окно открыто. */
    public void heartbeat(Long userId, Long orderId) {
        if (userId == null || orderId == null) return;
        long expires = System.currentTimeMillis() + TTL_MS;
        map.computeIfAbsent(userId, k -> new ConcurrentHashMap<>()).put(orderId, expires);
    }

    /** Закрытие страницы — явная очистка (не обязательная, TTL подстрахует). */
    public void leave(Long userId, Long orderId) {
        if (userId == null || orderId == null) return;
        var orders = map.get(userId);
        if (orders != null) orders.remove(orderId);
    }

    /** TRUE если пользователь сейчас смотрит этот заказ. */
    public boolean isViewing(Long userId, Long orderId) {
        if (userId == null || orderId == null) return false;
        var orders = map.get(userId);
        if (orders == null) return false;
        Long expiry = orders.get(orderId);
        if (expiry == null) return false;
        if (System.currentTimeMillis() > expiry) {
            orders.remove(orderId);
            return false;
        }
        return true;
    }
}
