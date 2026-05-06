package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.ServiceDefinition;
import ru.carpet.repository.ServiceDefinitionRepository;

import java.util.List;

@Service
public class ServiceDefinitionService {

    private final ServiceDefinitionRepository repository;
    private final PriceListService priceListService;

    public ServiceDefinitionService(ServiceDefinitionRepository repository, PriceListService priceListService) {
        this.repository = repository;
        this.priceListService = priceListService;
    }

    public List<ServiceDefinition> findAll() {
        return repository.findAll();
    }

    public ServiceDefinition findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ServiceDefinition not found: " + id));
    }

    @Transactional
    public ServiceDefinition create(String name, java.math.BigDecimal basePrice, ru.carpet.model.PricingType pricingType) {
        ServiceDefinition newDef = repository.save(name, basePrice, pricingType);
        priceListService.seedForServiceDef(newDef.id());
        return newDef;
    }

    @Transactional
    public ServiceDefinition update(Long id, String name, java.math.BigDecimal basePrice, ru.carpet.model.PricingType pricingType) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ServiceDefinition not found: " + id));
        return repository.update(id, name, basePrice, pricingType);
    }

    /**
     * Soft-delete: услуга помечается как удалённая (is_deleted=true) и исчезает из форм добавления,
     * но сохраняется в исторических order_item_services через FK.
     */
    @Transactional
    public void delete(Long id) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ServiceDefinition not found: " + id));
        repository.delete(id);
    }
}
