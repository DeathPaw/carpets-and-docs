package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.model.ErrorLogEntry;
import ru.carpet.repository.ErrorLogRepository;

import java.util.List;

@RestController
@RequestMapping("/api/error-log")
public class ErrorLogController {

    private final ErrorLogRepository repository;

    public ErrorLogController(ErrorLogRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<ErrorLogEntry> getAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        return repository.findAll(page, size);
    }
}
