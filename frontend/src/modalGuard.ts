/**
 * Общее поведение модальных окон: защита от случайного закрытия и Enter как
 * подтверждение формы.
 *
 * Оба правила висят на document, а не прописаны в каждом из трёх десятков окон:
 * так они действуют одинаково везде, включая те окна, которые появятся позже.
 */
export function installModalBehaviour(): void {
  guardAccidentalClose()
  submitOnEnter()
}

/**
 * Защита модалок от случайного закрытия «протащенным» кликом.
 *
 * Модалки в проекте закрываются по клику на затемнение: `<div
 * className="modal-overlay" onClick={onClose}>`. Браузер считает кликом пару
 * mousedown+mouseup, а целью — их общего предка. Поэтому если начать выделять
 * текст внутри окна и отпустить кнопку за его краем, целью click становится
 * затемнение — и окно закрывается, унося несохранённые правки.
 *
 * Чиним один раз для всех модалок сразу, а не в каждой из 29: слушатель висит
 * на document в фазе перехвата, то есть срабатывает раньше React-обработчиков.
 * Если mousedown был внутри окна, а click пришёлся на затемнение — гасим
 * событие. Осознанный клик по затемнению (нажал и отпустил на нём же)
 * работает как прежде.
 */
function guardAccidentalClose(): void {
  /** Начался ли текущий жест внутри окна модалки. */
  let startedInsideModal = false

  document.addEventListener('mousedown', e => {
    const t = e.target as Element | null
    startedInsideModal = !!t?.closest?.('.modal')
  }, true)

  document.addEventListener('click', e => {
    const t = e.target as Element | null
    // Интересует только клик ровно по затемнению: клики внутри окна
    // обрабатываются как обычно.
    if (!t || !t.classList?.contains('modal-overlay')) return
    if (!startedInsideModal) return
    e.stopPropagation()
    e.preventDefault()
    startedInsideModal = false
  }, true)
}

/**
 * Enter в поле формы — то же, что нажать основную кнопку окна («Сохранить»,
 * «Создать», «Подтвердить»). Оператор заполняет поля с клавиатуры, и тянуться
 * мышью к кнопке после каждого ввода неудобно.
 *
 * Работает только когда фокус в поле ввода: в окнах-подтверждениях без полей
 * Enter ничего не нажимает — иначе случайное нажатие удаляло бы позицию.
 * В многострочном поле Shift+Enter по-прежнему переносит строку.
 *
 * Слушаем на всплытии и уважаем defaultPrevented: выпадающие списки
 * (StyledSelect, подсказки адреса) обрабатывают Enter сами, и перебивать их
 * нельзя — иначе выбор пункта списка отправлял бы всю форму.
 */
function submitOnEnter(): void {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.defaultPrevented || e.isComposing) return

    const target = e.target as HTMLElement | null
    const modal = target?.closest?.('.modal')
    if (!modal || !target) return

    const tag = target.tagName
    const isField =
      (tag === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox'
        && (target as HTMLInputElement).type !== 'radio')
      || tag === 'TEXTAREA'
    if (!isField) return

    // Приоритет: сохранить → подтвердить → опасное действие. Порядок важен:
    // в окне с «Сохранить» и «Удалить» Enter обязан означать «Сохранить».
    const actions = modal.querySelector('.modal-actions') ?? modal
    const button =
      actions.querySelector<HTMLButtonElement>('.btn-primary:not([disabled])')
      ?? actions.querySelector<HTMLButtonElement>('.btn-success:not([disabled])')
      ?? actions.querySelector<HTMLButtonElement>('.btn-danger:not([disabled])')
    if (!button) return

    e.preventDefault()
    button.click()
  })
}
