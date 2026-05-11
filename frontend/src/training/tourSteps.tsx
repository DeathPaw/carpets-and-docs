import type { Step } from 'react-joyride'

/**
 * Сценарии тура — отдельный файл, чтобы:
 *   • легко добавлять/править шаги, не трогая логику Joyride;
 *   • переиспользовать как для большого тура (склеиваем все по порядку),
 *     так и для мини-тура по конкретной странице;
 *   • держать тексты в одном месте — удобно вычитывать.
 *
 * Каждый сценарий — массив шагов Joyride. У каждого шага есть `data.route`,
 * указывающий, на какой странице он живёт. Тур-движок при переходе к шагу с
 * другим маршрутом сам сделает navigate() и подождёт, пока DOM-элемент
 * появится на новой странице.
 */

export interface TourStep extends Step {
    data?: { route?: string; section?: string }
}

// Жирный текст в подсказках стилизуем глобально, чтобы не повторять style.
const Strong = ({ children }: { children: React.ReactNode }) => (
    <strong style={{ color: '#2c3e50' }}>{children}</strong>
)

// ---------- ДАШБОРД ----------
const dashboardSteps: TourStep[] = [
    {
        target: '[data-tour="dashboard-today"]',
        content: (
            <div>
                Виджеты <Strong>«На сегодня»</Strong> — что физически нужно сделать в течение дня:
                сколько заборов, сколько доставок, сколько новых обращений. Кликабельные —
                открывают отфильтрованный список заказов.
            </div>
        ),
        data: { route: '/dashboard' },
    },
    {
        target: '[data-tour="dashboard-statuses"]',
        content: (
            <div>
                Срез по <Strong>статусам</Strong>: видно, сколько заказов на каждой стадии —
                от LEAD до доставлен. Помогает понять, где затор: слишком много в LEAD —
                не успеваем оформлять; слишком много DONE — не успеваем доставлять.
            </div>
        ),
        data: { route: '/dashboard' },
    },
    {
        target: '[data-tour="dashboard-problems"]',
        content: (
            <div>
                <Strong>Проблемные заказы</Strong> — счётчики висят, пока есть аномалии:
                просрочка по фактической дате, заказ без логиста, заказ без адреса. Виджет
                исчезает, когда всё в порядке — оператор видит только то, на что нужно среагировать.
            </div>
        ),
        data: { route: '/dashboard' },
    },
]

// ---------- ЗАКАЗЫ ----------
const ordersSteps: TourStep[] = [
    {
        target: '[data-tour="orders-create-btn"]',
        content: (
            <div>
                <Strong>«Новый заказ»</Strong> — модалка с минимумом полей: клиент (можно
                выбрать существующего из подсказок), адреса забора и доставки. После сохранения
                откроется карточка заказа, где добавляются позиции и услуги.
            </div>
        ),
        data: { route: '/orders' },
    },
    {
        target: '[data-tour="orders-filters"]',
        content: (
            <div>
                <Strong>Фильтры</Strong>: статус, тип оплаты, диапазоны дат, район. Сохраняются в URL —
                можно отправить ссылку коллеге, у него откроется тот же отфильтрованный список.
            </div>
        ),
        data: { route: '/orders' },
    },
    {
        target: '[data-tour="orders-table"]',
        content: (
            <div>
                Список заказов. Клик по строке — карточка заказа. Сортировка по любому столбцу
                (Shift+клик — добавить вторую сортировку). Цветные бейджи — статусы.
            </div>
        ),
        data: { route: '/orders' },
    },
]

// ---------- КАРТОЧКА ЗАКАЗА (открываем заказ #3 — IN_PROGRESS) ----------
const orderDetailSteps: TourStep[] = [
    {
        target: '[data-tour="order-info"]',
        content: (
            <div>
                <Strong>Шапка заказа</Strong>: статус (с легендой), оплата, адреса забора и доставки,
                фактические даты. Прямо отсюда меняем статус, отмечаем оплату, проставляем
                фактические даты.
            </div>
        ),
        data: { route: '/orders/3' },
    },
    {
        target: '[data-tour="order-items"]',
        content: (
            <div>
                <Strong>Позиции</Strong> — это то, что чистим. У каждой свой тип, размеры,
                статус и набор услуг. Внутри строки разворачивается панель услуг, где назначаются
                исполнители и фиксируется выполнение.
            </div>
        ),
        data: { route: '/orders/3' },
    },
    {
        target: '[data-tour="order-calc"]',
        content: (
            <div>
                <Strong>Расчёт стоимости</Strong>: автоматически — сумма цен позиций + модификаторы
                (срочно, постоянный клиент, пенсионер). Доставка считается с учётом порога
                «бесплатно от X ₽».
            </div>
        ),
        data: { route: '/orders/3' },
    },
]

// ---------- ПОЗИЦИИ ----------
const itemsSteps: TourStep[] = [
    {
        target: '[data-tour="items-filters"]',
        content: (
            <div>
                Все вещи всех заказов в одной таблице. Удобно фильтровать по типу
                (например, посмотреть только «Шторы») или статусу («все, что в работе»).
                Из позиции — одним кликом в её заказ.
            </div>
        ),
        data: { route: '/items' },
    },
]

// ---------- ЛОГИСТИКА ----------
const logisticsSteps: TourStep[] = [
    {
        target: '[data-tour="logistics-grid"]',
        content: (
            <div>
                <Strong>Сетка дней</Strong>: слева — заборы, справа — доставки. Карточки заказов
                можно <em>перетаскивать</em> мышкой между датами — система подхватит изменение,
                клиенту изменится плановая дата.
            </div>
        ),
        data: { route: '/logistics' },
    },
    {
        target: '[data-tour="logistics-map"]',
        content: (
            <div>
                <Strong>Карта</Strong> справа — все точки забора (синие) и доставки (зелёные)
                на выбранную дату. Помогает прикинуть маршрут водителя. Клик — развернуть
                на полный экран.
            </div>
        ),
        data: { route: '/logistics' },
    },
]

// ---------- ПРОИЗВОДСТВО ----------
const productionSteps: TourStep[] = [
    {
        target: '[data-tour="production-modes"]',
        content: (
            <div>
                Три среза: <Strong>по заказам</Strong> (что в каком заказе ещё не закрыто),
                <Strong> по позициям</Strong> (вещи в работе) и <Strong>по услугам</Strong>
                (загрузка каждого мастера, что у него «висит»). Удобно видеть, кто перегружен,
                а у кого окно.
            </div>
        ),
        data: { route: '/production' },
    },
]

// ---------- АНАЛИТИКА ----------
const analyticsSteps: TourStep[] = [
    {
        target: '[data-tour="analytics-district-map"]',
        content: (
            <div>
                <Strong>Карта районов СПб</Strong> — тепловая, окрашена по количеству заказов.
                Клик по району — открыть логистику с фильтром по этому району.
            </div>
        ),
        data: { route: '/analytics' },
    },
    {
        target: '[data-tour="analytics-revenue"]',
        content: (
            <div>
                <Strong>Выручка по месяцам</Strong> — выручка из оплаченных заказов с группировкой
                по месяцу оплаты. Помогает увидеть сезонность и тренд.
            </div>
        ),
        data: { route: '/analytics' },
    },
    {
        target: '[data-tour="analytics-top-clients"]',
        content: (
            <div>
                <Strong>ТОП клиентов</Strong> — кто принёс больше всего денег. Клик по строке —
                открыть все заказы этого клиента. Удобно для звонков «давно не было, как дела?»
                и для VIP-программ.
            </div>
        ),
        data: { route: '/analytics' },
    },
]

// ---------- КЛИЕНТЫ ----------
const clientsSteps: TourStep[] = [
    {
        target: '[data-tour="clients-search"]',
        content: (
            <div>
                Поиск по любому полю: ФИО, телефон, адрес, ИНН. Карточка клиента — это его профиль:
                история заказов, события (звонки, замечания), индивидуальные модификаторы
                (например, скидка постоянному клиенту).
            </div>
        ),
        data: { route: '/clients' },
    },
]

// ---------- НАВИГАЦИЯ + СУПЕРВИЗОР + RESET ----------
const navSteps: TourStep[] = [
    {
        target: '[data-tour="nav-dashboard"]',
        content: 'Меню слева — основные разделы оператора. Я проведу по каждому.',
    },
    {
        target: '[data-tour="supervisor-toggle"]',
        content: (
            <div>
                <Strong>Режим «Супервизор»</Strong> — открывает справочники, прайс-лист,
                сотрудников, доходность, логи. Включается одной кнопкой, рамка экрана
                подсвечивается оранжевым — оператор не путается, в каком он режиме.
            </div>
        ),
    },
    {
        target: '[data-tour="training-reset"]',
        content: (
            <div>
                Если что-то нагородили — <Strong>«Начать заново»</Strong> сбросит демо-данные
                к исходному состоянию. Можно тренироваться сколько угодно.
            </div>
        ),
    },
]

// ---------- WELCOME / FINALE ----------
const welcomeStep: TourStep = {
    target: 'body',
    placement: 'center',
    title: 'Добро пожаловать в тренажёр',
    content: (
        <div>
            <p style={{ margin: '0 0 12px' }}>
                Это безопасный стенд для обучения операторов. Любые действия обратимы — кнопка
                «Начать заново» в зелёном баннере сбросит данные.
            </p>
            <p style={{ margin: 0 }}>
                Я проведу вас через все основные разделы и покажу, что куда нажимать. Дальше
                продолжите сами.
            </p>
        </div>
    ),
}

const finaleStep: TourStep = {
    target: 'body',
    placement: 'center',
    title: 'Готово',
    content: (
        <div>
            <p style={{ margin: '0 0 12px' }}>
                Это всё, что хотелось показать. Дальше — пробуйте сами: создайте заказ,
                назначьте мастера, переведите статусы, посмотрите аналитику.
            </p>
            <p style={{ margin: 0 }}>
                В баннере сверху всегда есть кнопки <Strong>«Большой тур»</Strong> (повторить
                всё) и <Strong>«Тур по этой странице»</Strong> (мини-обзор текущей вкладки).
            </p>
        </div>
    ),
}

/**
 * Большой сценарий — все шаги по порядку. Используется при первом запуске
 * и при клике «Большой тур» в баннере.
 */
export const fullTourSteps: TourStep[] = [
    welcomeStep,
    ...navSteps.slice(0, 1),     // первый шаг навигации (про меню)
    ...dashboardSteps,
    ...ordersSteps,
    ...orderDetailSteps,
    ...itemsSteps,
    ...logisticsSteps,
    ...productionSteps,
    ...analyticsSteps,
    ...clientsSteps,
    ...navSteps.slice(1),        // супервизор + reset
    finaleStep,
]

/**
 * Сценарии по страницам — ключ совпадает с pathname (или его префиксом).
 * Используется в мини-туре «Тур по этой странице».
 */
export const pageScenarios: Record<string, TourStep[]> = {
    '/dashboard':  dashboardSteps,
    '/orders':     ordersSteps,
    '/items':      itemsSteps,
    '/logistics':  logisticsSteps,
    '/production': productionSteps,
    '/analytics':  analyticsSteps,
    '/clients':    clientsSteps,
}

/**
 * Возвращает мини-сценарий для текущего пути. Для динамических роутов
 * (`/orders/123`) — пробуем сначала точный матч, потом по префиксу.
 */
export function pageScenarioFor(pathname: string): TourStep[] {
    if (pageScenarios[pathname]) return pageScenarios[pathname]
    if (pathname.startsWith('/orders/')) return orderDetailSteps
    return []
}
