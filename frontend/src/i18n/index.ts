/**
 * Лёгкая i18n-инфраструктура — без зависимостей (i18next, react-intl и пр.).
 * Используется ТОЛЬКО в кабинете работника и водителя — оператор/супервизор
 * остаются на русском (см. обсуждение: трудовые мигранты работают на
 * производстве и доставке, в офисе сидят русскоговорящие).
 *
 * <p>Поддерживаемые языки (приоритет):
 *   ru — русский (база);
 *   uz — узбекский (большинство производственного персонала);
 *   tg — таджикский (вторая по численности группа в СПб).
 *
 * <p>Дальнейшие языки (киргизский, армянский, азербайджанский, казахский)
 * добавляются дописыванием словаря в этом же файле — кода не трогаем.
 *
 * <p>Выбор языка хранится в localStorage и переключается на странице входа
 * работника. По умолчанию — русский (если в браузере «ru-RU» или вообще
 * не определилось).
 */

export type Lang = 'ru' | 'uz' | 'tg'

export const SUPPORTED_LANGS: { code: Lang; label: string; nativeLabel: string }[] = [
    { code: 'ru', label: 'Русский',    nativeLabel: 'Русский' },
    { code: 'uz', label: 'Узбекский',  nativeLabel: "O'zbekcha" },
    { code: 'tg', label: 'Таджикский', nativeLabel: 'Тоҷикӣ' },
]

const STORAGE_KEY = 'worker_lang'

/** Текущий язык. Берём из localStorage; если нет — пытаемся угадать по navigator.language. */
export function getLang(): Lang {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
    if (stored && SUPPORTED_LANGS.some(l => l.code === stored)) return stored
    const nav = navigator.language?.slice(0, 2).toLowerCase()
    if (nav === 'uz') return 'uz'
    if (nav === 'tg') return 'tg'
    return 'ru'
}

export function setLang(lang: Lang) {
    localStorage.setItem(STORAGE_KEY, lang)
    // Полный рефреш — проще и надёжнее, чем тянуть провайдер через всё дерево.
    // На странице работника это безболезненно — состояния немного.
    window.location.reload()
}

/**
 * Словарь переводов. Ключи — стабильные английские идентификаторы (НЕ русский
 * текст), чтобы можно было менять русский без обновления кода. Если перевод
 * отсутствует — фолбэк к ru.
 */
const dict: Record<string, Record<Lang, string>> = {
    // Общее
    'app.brand':              { ru: 'Учёт заказов',         uz: "Buyurtmalar hisobi",        tg: 'Ҳисоби фармоишҳо' },
    'common.back':            { ru: 'Назад',                uz: 'Orqaga',                    tg: 'Бозгашт' },
    'common.cancel':          { ru: 'Отмена',               uz: 'Bekor qilish',              tg: 'Бекор кардан' },
    'common.save':            { ru: 'Сохранить',            uz: 'Saqlash',                   tg: 'Захира кардан' },
    'common.skip':            { ru: 'Пропустить',           uz: "O'tkazib yuborish",         tg: 'Гузаронидан' },
    'common.continue':        { ru: 'Далее',                uz: 'Davom etish',               tg: 'Идома' },
    'common.error':           { ru: 'Ошибка',               uz: 'Xato',                      tg: 'Хато' },
    'common.loading':         { ru: 'Загрузка...',          uz: 'Yuklanmoqda...',            tg: 'Боргирӣ...' },

    // Вход
    'login.who':              { ru: 'Кто пришёл?',          uz: 'Kim keldi?',                tg: 'Кӣ омад?' },
    'login.tap_yours':        { ru: 'Нажмите свою плитку',  uz: "O'zingizning plitka ni bosing", tg: 'Кошинаки худро пахш кунед' },
    'login.no_pin':           { ru: 'PIN не задан',         uz: 'PIN belgilanmagan',         tg: 'PIN таъин нашудааст' },
    'login.enter_pin':        { ru: 'Введите PIN',          uz: 'PIN ni kiriting',           tg: 'PIN-ро ворид кунед' },
    'login.first_time':       { ru: 'Первый вход — придумайте 4–6 цифр и запомните.',
                                uz: 'Birinchi kirish — 4–6 raqam o\'ylab toping va eslab qoling.',
                                tg: 'Вуруди аввал — 4-6 рақам интихоб кунед ва ба ёд гиред.' },
    'login.step1':            { ru: 'Шаг 1: введите PIN (минимум 4 цифры)',
                                uz: '1-bosqich: PIN ni kiriting (kamida 4 raqam)',
                                tg: 'Қадами 1: PIN-ро ворид кунед (на камтар аз 4 рақам)' },
    'login.step2':            { ru: 'Шаг 2: повторите тот же PIN',
                                uz: '2-bosqich: shu PIN ni takrorlang',
                                tg: 'Қадами 2: PIN-ро такрор кунед' },
    'login.confirm':          { ru: 'Подтверждение — нажмите OK',
                                uz: 'Tasdiqlash — OK bosing',
                                tg: 'Тасдиқ — OK-ро пахш кунед' },
    'login.wrong_pin':        { ru: 'Неверный PIN',         uz: "Noto'g'ri PIN",             tg: 'PIN нодуруст' },
    'login.pin_mismatch':     { ru: 'Цифры не совпадают, попробуйте ещё раз',
                                uz: "Raqamlar mos kelmaydi, qaytadan urinib ko'ring",
                                tg: 'Рақамҳо мувофиқ нестанд, бори дигар кӯшиш кунед' },
    'login.other':            { ru: 'Не я — другой сотрудник',
                                uz: "Men emas — boshqa xodim",
                                tg: 'Ман не — ходими дигар' },

    // Кабинет
    'home.hello':             { ru: 'Здравствуйте,',        uz: 'Assalomu alaykum,',         tg: 'Салом,' },
    'home.logout':            { ru: 'Выйти',                uz: 'Chiqish',                   tg: 'Баромадан' },
    'home.today':             { ru: 'На сегодня',           uz: 'Bugun uchun',               tg: 'Барои имрӯз' },
    'home.done':              { ru: 'Сделано',              uz: 'Bajarildi',                 tg: 'Иҷро шуд' },
    'home.empty':             { ru: 'Всё закрыто — отдыхайте 😊',
                                uz: 'Hammasi tugadi — dam oling 😊',
                                tg: 'Ҳама анҷом ёфт — истироҳат кунед 😊' },
    'home.take':              { ru: 'Взять в работу',       uz: 'Ishga olish',               tg: 'Ба кор гирифтан' },
    'home.complete':          { ru: 'Завершить',            uz: 'Yakunlash',                 tg: 'Анҷом додан' },
    'home.dimensions':        { ru: 'Размеры',              uz: "O'lchamlar",                tg: 'Андозаҳо' },
    'home.status.created':    { ru: 'Не начато',            uz: "Boshlanmagan",              tg: 'Сар нашудааст' },
    'home.status.in_progress':{ ru: 'В работе',             uz: 'Ishda',                     tg: 'Дар кор' },
    'home.status.done':       { ru: 'Сделано',              uz: 'Bajarildi',                 tg: 'Иҷро шуд' },

    // Фото — заголовки специально явные («до начала работы / результат»),
    // чтобы было понятно из контекста, какое фото сейчас просят сделать.
    'photo.before':           { ru: 'Сфотографируйте вещь перед началом работы (можно пропустить)',
                                uz: 'Ish boshlashdan oldin buyumni suratga oling (o\'tkazib yuborilishi mumkin)',
                                tg: 'Пеш аз оғози кор, ашёро акс гиред (метавонед гузаронед)' },
    'photo.after':            { ru: 'Сфотографируйте результат работы (можно пропустить)',
                                uz: 'Ish natijasini suratga oling (o\'tkazib yuborilishi mumkin)',
                                tg: 'Натиҷаи корро акс гиред (метавонед гузаронед)' },
    'photo.take':             { ru: '📷 Снять или выбрать фото',
                                uz: '📷 Foto olish yoki tanlash',
                                tg: '📷 Гирифтан ё интихоб кардани акс' },
    'photo.save':             { ru: 'Сохранить фото',       uz: 'Fotoni saqlash',            tg: 'Аксро захира кардан' },

    // Откат статуса (Спринт D — фидбэк от пользователя)
    'home.undo':              { ru: 'Откатить',             uz: 'Bekor qilish',              tg: 'Бекор кардан' },
    'home.undo.confirm':      { ru: 'Откатить статус назад?',
                                uz: 'Statusni orqaga qaytarish kerakmi?',
                                tg: 'Ҳолатро бозгардондан мехоҳед?' },

    // Маршрут
    'route.title':            { ru: 'Маршрут на сегодня',   uz: 'Bugungi marshrut',          tg: 'Масири имрӯза' },
    'route.empty':            { ru: 'На сегодня точек нет', uz: 'Bugun nuqtalar yo\'q',      tg: 'Имрӯз нуқтаҳо нестанд' },
    'route.print':            { ru: '🖨 Печать',            uz: '🖨 Chop etish',             tg: '🖨 Чоп' },
    'route.pickup':           { ru: 'Забор',                uz: 'Olib ketish',               tg: 'Бардоштан' },
    'route.delivery':         { ru: 'Доставка',             uz: 'Yetkazib berish',           tg: 'Расонидан' },
    'route.paid':             { ru: '✓ оплачен',            uz: '✓ to\'langan',              tg: '✓ пардохта шуд' },
    'route.to_collect':       { ru: 'к получению',          uz: 'olishga',                   tg: 'барои қабул' },
}

/**
 * Переводчик. Если ключа нет — возвращает сам ключ (видимая ошибка
 * в интерфейсе, разработчик заметит и допишет перевод).
 */
export function t(key: string): string {
    const entry = dict[key]
    if (!entry) return key
    const lang = getLang()
    return entry[lang] || entry.ru || key
}
