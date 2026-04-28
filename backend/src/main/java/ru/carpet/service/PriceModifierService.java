package ru.carpet.service;

import org.springframework.stereotype.Service;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.PriceModifier;
import ru.carpet.repository.PriceModifierRepository;

import java.math.BigDecimal;
import java.util.List;

@Service
public class PriceModifierService {

    private final PriceModifierRepository repository;

    public PriceModifierService(PriceModifierRepository repository) {
        this.repository = repository;
    }

    public List<PriceModifier> findAll() {
        return repository.findAll();
    }

    public PriceModifier findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Price modifier not found: " + id));
    }

    public PriceModifier create(String name, BigDecimal percent) {
        return repository.save(name, percent);
    }

    public PriceModifier update(Long id, String name, BigDecimal percent) {
        findById(id);
        return repository.update(id, name, percent);
    }

    public void delete(Long id) {
        findById(id);
        repository.delete(id);
    }
}
