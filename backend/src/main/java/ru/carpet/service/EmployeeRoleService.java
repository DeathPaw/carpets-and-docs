package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.ConflictException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.EmployeeRole;
import ru.carpet.repository.EmployeeRoleRepository;

import java.util.List;

@Service
public class EmployeeRoleService {

    private final EmployeeRoleRepository repository;

    public EmployeeRoleService(EmployeeRoleRepository repository) {
        this.repository = repository;
    }

    public List<EmployeeRole> findAll() {
        return repository.findAll();
    }

    public EmployeeRole findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Role not found: " + id));
    }

    @Transactional
    public EmployeeRole create(String name, String description, List<Long> itemTypeIds) {
        validateName(name);
        return repository.save(name.trim(), description, itemTypeIds);
    }

    @Transactional
    public EmployeeRole update(Long id, String name, String description, List<Long> itemTypeIds) {
        validateName(name);
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Role not found: " + id));
        return repository.update(id, name.trim(), description, itemTypeIds);
    }

    @Transactional
    public void delete(Long id) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Role not found: " + id));
        // Если роль на ком-то висит — блокируем удаление. Так оператор не сможет
        // случайно «потерять» привязку у нескольких сотрудников разом; сначала
        // нужно явно перевести их в другую роль (или снять роль).
        long usage = repository.countEmployeesUsing(id);
        if (usage > 0) {
            throw new ru.carpet.exception.BusinessRuleException(
                "Роль назначена " + usage + " сотрудникам. Сначала переведите их в другую роль или снимите."
            );
        }
        repository.delete(id);
    }

    private void validateName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new ConflictException("Название роли не может быть пустым");
        }
    }
}
