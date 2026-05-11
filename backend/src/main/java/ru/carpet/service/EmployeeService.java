package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.Employee;
import ru.carpet.repository.EmployeeRepository;

import java.util.List;

@Service
public class EmployeeService {

    private final EmployeeRepository repository;

    public EmployeeService(EmployeeRepository repository) {
        this.repository = repository;
    }

    public List<Employee> findAllActive() {
        return repository.findAllActive();
    }

    public List<Employee> findAll() {
        return repository.findAll();
    }

    public Employee findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Employee not found: " + id));
    }

    @Transactional
    public Employee create(String name, String contact, Long roleId) {
        return repository.save(name, contact, roleId);
    }

    @Transactional
    public Employee update(Long id, String name, String contact, Long roleId) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Employee not found: " + id));
        return repository.update(id, name, contact, roleId);
    }

    /** Сотрудники, способные работать с указанным типом позиции (по их роли). */
    public List<Employee> findSuitableForItemType(Long itemTypeId) {
        return repository.findActiveSuitableForItemType(itemTypeId);
    }

    /** Кандидаты в водители (роль с default item_type) — для модалки в логистике. */
    public List<Employee> findDrivers() {
        return repository.findActiveDrivers();
    }

    @Transactional
    public void deactivate(Long id) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Employee not found: " + id));
        repository.deactivate(id);
    }

    @Transactional
    public void activate(Long id) {
        repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Employee not found: " + id));
        repository.activate(id);
    }
}
