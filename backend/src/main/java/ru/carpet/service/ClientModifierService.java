package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.model.PriceModifier;
import ru.carpet.repository.ClientModifierRepository;

import java.util.List;

@Service
public class ClientModifierService {

    private final ClientModifierRepository repository;

    public ClientModifierService(ClientModifierRepository repository) {
        this.repository = repository;
    }

    public List<PriceModifier> getModifiers(Long clientId) {
        return repository.findByClientId(clientId);
    }

    @Transactional
    public void addModifier(Long clientId, Long modifierId) {
        repository.add(clientId, modifierId);
    }

    @Transactional
    public void removeModifier(Long clientId, Long modifierId) {
        repository.remove(clientId, modifierId);
    }
}
