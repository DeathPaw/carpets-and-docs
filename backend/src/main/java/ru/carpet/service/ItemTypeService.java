package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.dto.ItemTypeWithServices;
import ru.carpet.dto.PriceListEntryDto;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.ItemType;
import ru.carpet.repository.ItemTypeRepository;

import java.math.BigDecimal;
import java.util.List;

@Service
public class ItemTypeService {

    private final ItemTypeRepository repository;
    private final PriceListService priceListService;

    public ItemTypeService(ItemTypeRepository repository, PriceListService priceListService) {
        this.repository = repository;
        this.priceListService = priceListService;
    }

    public List<ItemType> findAll() {
        return repository.findAll();
    }

    public ItemType findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + id));
    }

    public ItemTypeWithServices findByIdWithServices(Long id) {
        ItemType itemType = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + id));
        List<PriceListEntryDto> services = priceListService.findByItemTypeId(id);
        return new ItemTypeWithServices(
                itemType.id(),
                itemType.name(),
                itemType.isDefault(),
                itemType.defaultPrice(),
                itemType.freeThreshold(),
                itemType.createdAt(),
                itemType.updatedAt(),
                services
        );
    }

    @Transactional
    public ItemType create(String name, boolean isDefault, BigDecimal defaultPrice, BigDecimal freeThreshold) {
        ItemType newItemType = repository.save(name, isDefault, defaultPrice, freeThreshold);
        priceListService.seedForItemType(newItemType.id());
        return newItemType;
    }

    @Transactional
    public ItemType update(Long id, String name, boolean isDefault, BigDecimal defaultPrice, BigDecimal freeThreshold) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + id));
        return repository.update(id, name, isDefault, defaultPrice, freeThreshold);
    }

    /**
     * Soft-delete: тип помечается удалённым (is_deleted=true) и исчезает из форм создания,
     * но исторические заказы продолжают ссылаться на него по FK. Никаких ошибок не возвращаем.
     */
    @Transactional
    public void delete(Long id) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + id));
        repository.delete(id);
    }

    public List<ItemType> findDefaults() {
        return repository.findDefaults();
    }
}
