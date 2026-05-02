package ru.carpet.service;

import org.springframework.stereotype.Service;
import ru.carpet.dto.PriceListEntryDto;
import ru.carpet.model.PriceListEntry;
import ru.carpet.model.ServiceDefinition;
import ru.carpet.repository.PriceListRepository;
import ru.carpet.repository.ServiceDefinitionRepository;
import ru.carpet.repository.ItemTypeRepository;
import ru.carpet.model.ItemType;

import java.math.BigDecimal;
import java.util.List;

@Service
public class PriceListService {

    private final PriceListRepository priceListRepository;
    private final ServiceDefinitionRepository serviceDefinitionRepository;
    private final ItemTypeRepository itemTypeRepository;

    public PriceListService(PriceListRepository priceListRepository,
                            ServiceDefinitionRepository serviceDefinitionRepository,
                            ItemTypeRepository itemTypeRepository) {
        this.priceListRepository = priceListRepository;
        this.serviceDefinitionRepository = serviceDefinitionRepository;
        this.itemTypeRepository = itemTypeRepository;
    }

    public List<PriceListEntryDto> findAll() {
        return priceListRepository.findAll().stream().map(this::toDto).toList();
    }

    public List<PriceListEntryDto> findByItemTypeId(Long itemTypeId) {
        return priceListRepository.findByItemTypeId(itemTypeId).stream().map(this::toDto).toList();
    }

    public PriceListEntryDto updatePrice(Long entryId, BigDecimal price, BigDecimal costPrice) {
        priceListRepository.updatePrice(entryId, price, costPrice);
        PriceListEntry entry = priceListRepository.findAll().stream()
                .filter(e -> e.id().equals(entryId)).findFirst().orElseThrow();
        return toDto(entry);
    }

    public void seedForItemType(Long itemTypeId) {
        priceListRepository.seedForItemType(itemTypeId);
    }

    public void seedForServiceDef(Long serviceDefId) {
        priceListRepository.seedForServiceDef(serviceDefId);
    }

    private PriceListEntryDto toDto(PriceListEntry entry) {
        ServiceDefinition sd = serviceDefinitionRepository.findById(entry.serviceDefId()).orElse(null);
        ItemType it = itemTypeRepository.findById(entry.itemTypeId()).orElse(null);
        return new PriceListEntryDto(
                entry.id(),
                entry.itemTypeId(),
                it != null ? it.name() : null,
                entry.serviceDefId(),
                sd != null ? sd.name() : null,
                sd != null ? sd.pricingType().name() : null,
                entry.price(),
                entry.costPrice(),
                entry.isActive()
        );
    }
}
