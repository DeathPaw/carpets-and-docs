package ru.carpet.service;

import org.springframework.stereotype.Service;
import ru.carpet.model.AuditLogEntry;
import ru.carpet.repository.AuditLogRepository;

import java.util.List;

@Service
public class AuditLogService {

    private final AuditLogRepository repository;

    public AuditLogService(AuditLogRepository repository) {
        this.repository = repository;
    }

    public void log(String entityType, Long entityId, String action, String description) {
        repository.log(entityType, entityId, action, description);
    }

    public List<AuditLogEntry> findAll(String entityType, String action, Long entityId, int page, int size) {
        return repository.findAll(entityType, action, entityId, page, size);
    }
}
