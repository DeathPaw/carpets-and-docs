package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.ItemType;
import ru.carpet.repository.ItemTypeRepository;

import java.util.List;

/**
 * Типы вещей клиента (Ковёр, Тюль, Шторы и т.п.) — V10.
 *
 * <p>После V10 у item_types убраны is_default/default_price/free_threshold:
 * вся «default»-логика переехала на SKU (is_auto_add, free_threshold). Здесь
 * остался только {@code name} + soft-delete.
 */
@Service
public class ItemTypeService {

    private final ItemTypeRepository repository;

    public ItemTypeService(ItemTypeRepository repository) {
        this.repository = repository;
    }

    public List<ItemType> findAll() {
        return repository.findAll();
    }

    public ItemType findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + id));
    }

    @Transactional
    public ItemType create(String name) {
        return repository.save(name);
    }

    @Transactional
    public ItemType update(Long id, String name) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + id));
        return repository.update(id, name);
    }

    @Transactional
    public void delete(Long id) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + id));
        repository.delete(id);
    }
}
