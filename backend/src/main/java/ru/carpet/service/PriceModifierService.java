package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.BusinessRuleException;
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

    @Transactional
    public PriceModifier create(PriceModifierRepository.Input in) {
        return repository.save(validate(null, in));
    }

    @Transactional
    public PriceModifier update(Long id, PriceModifierRepository.Input in) {
        findById(id);
        return repository.update(id, validate(id, in));
    }

    /**
     * V60: проверка настроек скидки. Для FIXED нужна сумма, для FREE_DELIVERY
     * процент и сумма не используются; промокод уникален без учёта регистра.
     */
    private PriceModifierRepository.Input validate(Long id, PriceModifierRepository.Input in) {
        if (in.name() == null || in.name().isBlank()) {
            throw new BusinessRuleException("Укажите название скидки.");
        }
        String kind = in.kind() == null ? "PERCENT" : in.kind();
        BigDecimal percent = in.percent() == null ? BigDecimal.ZERO : in.percent();
        BigDecimal amount = in.amount();
        switch (kind) {
            case "PERCENT" -> {
                if (percent.compareTo(new BigDecimal("-100")) < 0) throw new BusinessRuleException("Скидка не может быть больше 100%.");
                amount = null;
            }
            case "FIXED" -> {
                if (amount == null || amount.signum() <= 0) throw new BusinessRuleException("Укажите сумму скидки в рублях.");
                percent = BigDecimal.ZERO;
            }
            case "FREE_DELIVERY" -> { percent = BigDecimal.ZERO; amount = null; }
            default -> throw new BusinessRuleException("Неизвестный тип скидки: " + kind);
        }
        String code = in.promoCode() == null || in.promoCode().isBlank() ? null : in.promoCode().trim().toUpperCase();
        if (code != null) {
            repository.findByPromoCode(code).ifPresent(other -> {
                if (!other.id().equals(id)) throw new BusinessRuleException("Промокод «" + other.promoCode() + "» уже есть у скидки «" + other.name() + "».");
            });
        }
        if (in.validFrom() != null && in.validTo() != null && in.validTo().isBefore(in.validFrom())) {
            throw new BusinessRuleException("Дата окончания действия раньше даты начала.");
        }
        if (in.usageLimit() != null && in.usageLimit() <= 0) {
            throw new BusinessRuleException("Лимит использований должен быть больше нуля.");
        }
        return new PriceModifierRepository.Input(in.name().trim(), percent, kind, amount, code,
                in.autoAssignToClient(), in.validFrom(), in.validTo(), in.usageLimit(), in.active());
    }

    @Transactional
    public void delete(Long id) {
        findById(id);
        // Если модификатор уже применён к заказам/клиентам — удаление сломает FK.
        // Возвращаем понятное сообщение вместо «констрейнт упал».
        long usage = repository.countUsages(id);
        if (usage > 0) {
            throw new ru.carpet.exception.BusinessRuleException(
                "Модификатор используется в " + usage + " заказах/клиентах. Удаление запрещено."
            );
        }
        repository.delete(id);
    }
}
