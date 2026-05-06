package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.FeedbackRequest;
import ru.carpet.model.Feedback;
import ru.carpet.repository.FeedbackRepository;

import java.util.List;

/**
 * Обращения от оператора. POST доступен любому авторизованному, GET/DELETE — для
 * вкладки «Обращения» супервизора (на уровне фронта; до полноценной ролевой
 * авторизации все авторизованные могут читать).
 */
@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {

    private final FeedbackRepository repository;

    public FeedbackController(FeedbackRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<Feedback> getAll() {
        return repository.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Feedback create(@Valid @RequestBody FeedbackRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth != null ? auth.getName() : "unknown";
        return repository.save(
                request.topic(),
                request.body(),
                request.pagePath(),
                request.screenshot(),
                request.screenshotType(),
                username
        );
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        repository.delete(id);
    }

    /**
     * Смена статуса обращения. Допустимые значения проверяем по белому списку,
     * чтобы не сохранить опечатку.
     */
    @PatchMapping("/{id}/status")
    public Feedback setStatus(@PathVariable Long id, @org.springframework.web.bind.annotation.RequestBody java.util.Map<String, String> body) {
        String status = body.get("status");
        java.util.Set<String> allowed = java.util.Set.of(
                "NEW", "REVIEWED", "IN_PROGRESS", "DONE", "REJECTED", "NEED_INFO");
        if (status == null || !allowed.contains(status)) {
            throw new IllegalArgumentException("Недопустимый статус: " + status);
        }
        return repository.updateStatus(id, status);
    }
}
