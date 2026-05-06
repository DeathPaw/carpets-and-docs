package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.ConflictException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.District;
import ru.carpet.repository.DistrictRepository;

import java.util.List;

@Service
public class DistrictService {

    private final DistrictRepository repository;

    public DistrictService(DistrictRepository repository) {
        this.repository = repository;
    }

    public List<District> findAll(boolean activeOnly) {
        return repository.findAll(activeOnly);
    }

    public District findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("District not found: " + id));
    }

    @Transactional
    public District create(String name, Integer sortOrder, Boolean isActive) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("Название района не может быть пустым");
        }
        repository.findByName(trimmed).ifPresent(d -> {
            throw new ConflictException("Район с таким названием уже существует: " + trimmed);
        });
        return repository.save(
                trimmed,
                sortOrder == null ? 0 : sortOrder,
                isActive == null ? true : isActive
        );
    }

    @Transactional
    public District update(Long id, String name, Integer sortOrder, Boolean isActive) {
        District existing = findById(id);
        String trimmed = name == null ? existing.name() : name.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("Название района не может быть пустым");
        }
        repository.findByName(trimmed).ifPresent(d -> {
            if (!d.id().equals(id)) {
                throw new ConflictException("Район с таким названием уже существует: " + trimmed);
            }
        });
        return repository.update(
                id,
                trimmed,
                sortOrder == null ? existing.sortOrder() : sortOrder,
                isActive == null ? existing.isActive() : isActive
        );
    }

    @Transactional
    public void delete(Long id) {
        findById(id);
        repository.delete(id);
    }
}
