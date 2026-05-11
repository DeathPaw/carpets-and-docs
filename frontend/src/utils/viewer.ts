/**
 * Режим «Только просмотр» — для моноблока (Спринт D, фидбэк 11 мая).
 *
 * <p>Идея: один и тот же UI оператора + флажок в sessionStorage. Когда флажок
 * стоит, во всех местах редактирования (создать заказ, сменить статус, назначить
 * исполнителя и т.п.) мы либо скрываем кнопку, либо делаем компонент readonly.
 * Бэкенд при этом не ограничен — это «честный» UI-режим для моноблока, где
 * персонал «прохожий» (Никита показал гостям, не более). Если потребуется
 * жёсткая защита на уровне API — добавим отдельную роль в Spring Security.
 *
 * <p>Активация: на странице логина есть ссылка «Открыть в режиме просмотра».
 * Логин стандартный (admin/foxy), но в дополнение к auth-токену ставится
 * флаг {@code viewer_mode = '1'} в sessionStorage.
 */

const KEY = 'viewer_mode'

export function isViewerMode(): boolean {
    return sessionStorage.getItem(KEY) === '1'
}

export function setViewerMode(on: boolean) {
    if (on) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
}
