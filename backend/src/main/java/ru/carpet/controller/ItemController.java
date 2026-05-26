package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.OrderItemWithPosition;
import ru.carpet.model.OrderItemStatus;
import ru.carpet.repository.OrderItemPhotoRepository;
import ru.carpet.service.ItemFilterService;

import java.util.List;

@RestController
@RequestMapping("/api/items")
public class ItemController {

    private final ItemFilterService service;
    private final OrderItemPhotoRepository photoRepository;

    public ItemController(ItemFilterService service, OrderItemPhotoRepository photoRepository) {
        this.service = service;
        this.photoRepository = photoRepository;
    }

    @GetMapping
    public List<OrderItemWithPosition> getItems(
            @RequestParam(required = false) List<OrderItemStatus> statuses,
            @RequestParam(required = false) List<Long> itemTypeIds,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) Integer positionInOrder,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) String clientName,
            @RequestParam(required = false) String clientPhone,
            @RequestParam(required = false) Long legacyId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return service.findItems(statuses, itemTypeIds, orderId, positionInOrder, employeeId,
                clientName, clientPhone, legacyId, page, size);
    }

    /**
     * Батч-выборка ПЕРВОГО фото для каждой позиции из списка — для превьюшек в ItemsPage.
     * Раньше ItemThumb на каждую строку дёргал отдельный запрос (20 строк = 20 fetch'ей).
     * Возвращает фото с полем data (base64), потому что превью отрисовывается из той же строки —
     * отдельная подгрузка по клику для thumbs не нужна, размер минимальный (одна штука на позицию).
     */
    @GetMapping("/photos")
    public List<ru.carpet.model.OrderItemPhoto> getPhotosForItems(
            @RequestParam("itemIds") List<Long> itemIds) {
        return photoRepository.findFirstPhotoByOrderItemIds(itemIds);
    }
}
