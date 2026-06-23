import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Подсказчик — плавающая кнопка слева от FeedbackButton.
 *
 * <p>Открывает панель с контекстными подсказками «что делать дальше», исходя
 * из текущей страницы. У каждой подсказки короткий заголовок и развёрнутая
 * справка (раскрывается кликом). Группы из нескольких связанных шагов
 * («Наполнить заказ» → позиции/услуги/размеры) показываются сразу развёрнутыми.
 *
 * <p>Подсказки определяются по location.pathname; для динамических роутов
 * вроде /orders/:id матчим по префиксу. Расширять — просто допиши блок в
 * SUGGESTIONS_BY_ROUTE; формат: title + body (ReactNode) + опционально alwaysOpen.
 */

interface Suggestion {
  title: string
  body: React.ReactNode
  /** Если true — карточка сразу развёрнута, без клика. */
  alwaysOpen?: boolean
  /** Если задан — клик по заголовку также делает navigate. */
  navigateTo?: string
}

type RouteMatcher = (path: string) => boolean
const startsWith = (prefix: string): RouteMatcher => (p) => p === prefix || p.startsWith(prefix + '/')

const SECTION_DASHBOARD: Suggestion[] = [
  {
    title: 'Создать заказ',
    navigateTo: '/orders',
    body: <>На странице «Заказы» нажми <strong>«+ Новый заказ»</strong>. Заполни клиента (можно выбрать существующего из подсказок или создать прямо тут), адреса забора/доставки, при необходимости — Legacy ID и квартиру.</>,
  },
  {
    title: 'Посмотреть проблемные заказы',
    body: <>Виджет на главной (если есть аномалии) показывает: без координат, просроченные по факт. дате, без адреса. Клик → отфильтрованный список заказов.</>,
  },
  {
    title: 'Открыть логистику на сегодня',
    navigateTo: '/logistics',
    body: <>Сетка дней: слева заборы, справа доставки. Перетаскивай карточки между датами — клиенту автоматически меняется плановая дата. Над колонкой дня — цветовая полоска (день недели на карте).</>,
  },
]

const SECTION_ORDERS_LIST: Suggestion[] = [
  {
    title: 'Создать заказ',
    body: <>Кнопка <strong>«+ Новый заказ»</strong> сверху справа. После создания откроется карточка — там сразу наполняй позициями.</>,
  },
  {
    title: 'Отфильтровать заказы',
    body: <>Чипы статусов и тип оплаты — кликаются. Диапазон дат + поле «по какому полю» (создание/забор/доставка) — для выборок типа «доставки этой недели».</>,
  },
  {
    title: 'Сортировка',
    body: <>Клик по заголовку колонки — цикл «↓ → ↑ → нет». <kbd>Shift</kbd>+клик — добавить вторую сортировку (тай-брейкер).</>,
  },
]

const SECTION_ORDER_DETAIL: Suggestion[] = [
  {
    title: 'Наполнить заказ',
    alwaysOpen: true,
    body: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li><strong>Добавить позицию</strong> — кнопка «+ Добавить позицию» над таблицей позиций. Выбери тип (ковёр, плед, штора и т.д.).</li>
        <li><strong>Указать размеры</strong> — клик по ячейке «Размеры» в строке позиции. Заполни длину × ширину (площадь посчитается сама) или вес для пледа.</li>
        <li><strong>Добавить услуги</strong> — разверни строку позиции (▼), нажми «+ Добавить услугу». Выбери SKU из подходящих по типу. Цена считается автоматически: <em>SKU × нужный параметр</em>.</li>
        <li><strong>Назначить исполнителя</strong> — на услуге → «Исполнители». Видны только те сотрудники, чья роль умеет работать с этим типом.</li>
      </ul>
    ),
  },
  {
    title: 'Логистика заказа',
    body: <>В блоке «Логистика и детали» — кнопка «Редактировать». Укажи адреса (квартиру отдельным полем!), даты забора и доставки, слоты времени (1-часовые подынтервалы есть). Координаты подтягиваются с DaData автоматически.</>,
  },
  {
    title: 'Перевести статус',
    body: <>Кнопки «Перевести в» в шапке. <strong>LEAD → CREATED → FOR_PICKUP → DELIVERED → COMPLETED</strong> (через оплату). Отменить можно с любой стадии — с обязательной причиной (мин. 10 символов).</>,
  },
  {
    title: 'Принять оплату',
    body: <>Кнопка «Принять оплату» появляется когда статус DONE и заказ не оплачен. Выбери тип оплаты — заказ автоматически → COMPLETED.</>,
  },
  {
    title: 'Пометить проблемным',
    body: <>Кнопка «⚠ Проблема» сверху. Опиши причину (мин. 10 симв.) — админам мгновенно прилетит уведомление с алертом. Снять через «✓ Проблема решена».</>,
  },
  {
    title: 'Печать PDF',
    body: <>Кнопка «Печать PDF» — формирует акт с позициями и услугами. Отменённые из печатки исключаются автоматически.</>,
  },
]

const SECTION_ITEMS: Suggestion[] = [
  {
    title: 'Найти позицию',
    body: <>Фильтры: тип позиции (плашками), статус, исполнитель, № заказа, имя/телефон/legacy ID клиента. Все участвуют одновременно.</>,
  },
  {
    title: 'Перейти в её заказ',
    body: <>Клик по строке — карточка заказа со всеми позициями и услугами.</>,
  },
]

const SECTION_LOGISTICS: Suggestion[] = [
  {
    title: 'Распределить заказы по дням',
    body: <>Перетаскивай карточки между датами и слотами (мышкой). Плановая дата заказа меняется атомарно — оператор сразу видит обновлённый список.</>,
  },
  {
    title: 'Назначить водителя',
    body: <>В карточке заказа в логистике — мини-форма «Назначить водителя». Видны только сотрудники с ролью «водитель» (роль умеет работать с типом «Доставка»).</>,
  },
  {
    title: 'Печать маршрутного листа',
    alwaysOpen: true,
    body: (
      <>
        В шапке справа: <strong>«Маршрутный лист на: [день] · 🖨 Печать»</strong>.
        Печатается полный список выездов: № заказа, забор/отвоз, ФИ клиента,
        адрес+кв., телефон, сумма, время, комментарий — отсортировано по слоту.
      </>
    ),
  },
  {
    title: 'Цвета на карте',
    body: <>Маркеры на карте окрашены по дню недели (Пн — красный, Вт — оранжевый…). Полоска над колонкой дня — того же цвета. Удобно: «синие точки — это пятничные».</>,
  },
]

const SECTION_PRODUCTION: Suggestion[] = [
  {
    title: 'Двигать статусы услуг',
    body: <>Режим «По услугам»: drag-n-drop карточки между колонками. Если у услуги нет исполнителя — откроется модалка выбора, прежде чем поставить статус «В работе».</>,
  },
  {
    title: 'Найти услугу',
    body: <>Универсальный поиск сверху работает во всех 3 режимах (заказы/позиции/услуги): имя клиента / телефон / legacy ID. Плюс фильтры по сотруднику, типу, услуге, району.</>,
  },
]

const SECTION_ANALYTICS: Suggestion[] = [
  {
    title: 'Выбрать период',
    body: <>Сверху — пресеты «Всё время / Текущий месяц / 7 дней / 30 / 90» + ручной диапазон. Все графики перестраиваются.</>,
  },
  {
    title: 'Клик по месяцу выручки',
    body: <>Столбец в графике «Выручка по месяцам» кликабельный → откроется список заказов за этот месяц.</>,
  },
  {
    title: 'Карточка сотрудника',
    body: <>Клик по столбцу сотрудника → модалка с его выполненными услугами за выбранный период.</>,
  },
  {
    title: 'Гарантийная статистика',
    body: <>Клик по красному числу гарантийных — список именно гарантийных заказов клиента (видно причины).</>,
  },
]

const SECTION_CLIENTS: Suggestion[] = [
  {
    title: 'Найти клиента',
    body: <>Раздельные фильтры: имя, телефон, № заказа, Legacy ID (оба ищут через заказ → клиент). Плюс общий текстовый поиск (адрес, ИНН, орг).</>,
  },
  {
    title: 'Создать клиента',
    body: <>Кнопка «+ Новый клиент». Адрес — отдельно, квартира — в поле «Кв./офис» рядом. Модификаторы (пенсионер, постоянный, ветеран СВО) сразу же.</>,
  },
]

// V19 (#9): подсказки для супервизорских/админских разделов.

const SECTION_REFERENCES: Suggestion[] = [
  {
    title: 'Типы позиций',
    body: <>Список ковров/пледов/штор и т.п. — что принимает прачечная. Тип = «контейнер» для услуг.</>,
  },
  {
    title: 'SKU-каталог',
    body: <>«Прайс»: что и за сколько. У каждого SKU тип ценообразования (FIXED / по площади / по весу / …), цена, себестоимость и атрибуты-диапазоны (по площади, весу, типу позиции — для авто-подбора).</>,
  },
  {
    title: 'Слоты доставки',
    body: <>По дню недели: будни 17:00-20:30, сб 10:00-20:30, вс — нет. Используется на форме «Время забора/доставки» в карточке заказа и логистике.</>,
  },
  {
    title: 'Модификаторы цены',
    body: <>Скидки/наценки: «Сильное загрязнение +10%», «Пенсионер -10%», «Ветеран СВО -10%». Можно прикрепить к клиенту или к заказу.</>,
  },
]

const SECTION_EMPLOYEES: Suggestion[] = [
  {
    title: 'Создать сотрудника',
    body: <>Имя + телефон + email (отдельные поля) + роль (Стирщик / Водитель / Универсал) + PIN-код для мобильного входа.</>,
  },
  {
    title: 'Роли',
    body: <>Роль = разрешённые типы позиций. Стирщик умеет ковры/пледы/тюли; Водитель — только Доставка. При назначении исполнителя на услугу видны только подходящие.</>,
  },
  {
    title: 'Деактивировать',
    body: <>Сотрудник не удаляется (нужен для исторических услуг) — переводится в «деактивирован». В выпадающих он больше не появляется.</>,
  },
]

const SECTION_FEEDBACK: Suggestion[] = [
  {
    title: 'Обращения от операторов',
    body: <>Сюда приходят сообщения с кнопки «Связь с разработчиком» (правый нижний угол, у каждого оператора). Темы: BUG / SUGGESTION / QUESTION. Прикладывается скриншот и страница, с которой писали.</>,
  },
  {
    title: 'Статусы',
    body: <>NEW → IN_PROGRESS → DONE / REJECTED. Закрытое — в архив, оператор увидит ответ.</>,
  },
]

const SECTION_PROFITABILITY: Suggestion[] = [
  {
    title: 'Доходность по полученным деньгам',
    body: <>Считаются только оплаченные заказы (paid=TRUE). Созданный, но не оплаченный заказ в выручке не участвует.</>,
  },
  {
    title: 'По разрезам',
    body: <>По типу позиции, по клиенту, по сотруднику. Внутри каждого: revenue, cost (себестоимость из SKU × фактор позиции), profit, count.</>,
  },
  {
    title: 'Период',
    body: <>Сверху — диапазон дат. Если не задан — за всё время. Все колонки перестраиваются.</>,
  },
]

const SECTION_EXPENSES: Suggestion[] = [
  {
    title: 'Месячные расходы',
    body: <>Категории расходов (аренда, химия, зарплаты, бензин и т.п.) — фиксированные и динамические. Для каждой проставляется сумма за выбранный месяц.</>,
  },
  {
    title: 'Создать категорию',
    body: <>«+ Новая категория». Фиксированная — с дефолтной суммой, она подставится при выборе нового месяца. Динамическая — без дефолта, оператор вписывает фактическую сумму.</>,
  },
  {
    title: 'Переименовать/удалить',
    body: <>В строке категории — ✎ переименовать и × удалить. Удаление чистит все месячные суммы по этой категории.</>,
  },
]

const SECTION_USERS: Suggestion[] = [
  {
    title: 'Web-учётки',
    body: <>Управление логинами в систему (не PIN!). Роли: SUPERVISOR (всё) / ADMIN (без логов и расходов) / OPERATOR (рабочие разделы) / READONLY (только просмотр).</>,
  },
  {
    title: 'Привязка к сотруднику',
    body: <>Если задан employee_id — пользователь получает персональные уведомления о назначениях на услуги (SERVICE_ASSIGNED).</>,
  },
  {
    title: 'Сменить пароль',
    body: <>В строке пользователя — ✎ → новый пароль. Bcrypt-хэш на бэке. Старый перестаёт работать сразу.</>,
  },
]

const SECTION_ERROR_LOG: Suggestion[] = [
  {
    title: 'Лог ошибок',
    body: <>Все exception'ы бэка (с трассировкой и url). Используется для разбора инцидентов: «оператор пожаловался» → находим в логе → видим причину.</>,
  },
]

const SECTION_AUDIT_LOG: Suggestion[] = [
  {
    title: 'Лог действий',
    body: <>Кто что сделал: создал/изменил/отменил заказ, поменял статус, переименовал клиента, поднял проблемный флаг и т.п. По сущности (ORDER/CLIENT/USER) с описанием.</>,
  },
]

const SUGGESTIONS_BY_ROUTE: { match: RouteMatcher; section: string; items: Suggestion[] }[] = [
  { match: (p) => p === '/dashboard' || p === '/',     section: 'Главная',     items: SECTION_DASHBOARD },
  { match: startsWith('/orders'),                       section: 'Заказы',       items: SECTION_ORDERS_LIST }, // override for /orders/:id ниже
  { match: startsWith('/items'),                        section: 'Позиции',      items: SECTION_ITEMS },
  { match: startsWith('/logistics'),                    section: 'Логистика',    items: SECTION_LOGISTICS },
  { match: startsWith('/production'),                   section: 'Производство', items: SECTION_PRODUCTION },
  { match: startsWith('/analytics'),                    section: 'Аналитика',    items: SECTION_ANALYTICS },
  { match: startsWith('/clients'),                      section: 'Клиенты',      items: SECTION_CLIENTS },
  // V19 (#9): супервизорские/админские разделы.
  { match: startsWith('/references'),                   section: 'Справочники',  items: SECTION_REFERENCES },
  { match: startsWith('/employees'),                    section: 'Сотрудники',   items: SECTION_EMPLOYEES },
  { match: startsWith('/feedback'),                     section: 'Обращения',    items: SECTION_FEEDBACK },
  { match: startsWith('/profitability'),                section: 'Доходность',   items: SECTION_PROFITABILITY },
  { match: startsWith('/expenses'),                     section: 'Расходы',      items: SECTION_EXPENSES },
  { match: startsWith('/users'),                        section: 'Пользователи', items: SECTION_USERS },
  { match: startsWith('/error-log'),                    section: 'Лог ошибок',   items: SECTION_ERROR_LOG },
  { match: startsWith('/audit-log'),                    section: 'Лог действий', items: SECTION_AUDIT_LOG },
]

export default function SuggesterButton() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Закрыть по Escape — как у FeedbackButton.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Подбираем секцию для текущего пути. Для /orders отдельно: список vs детальная.
  const currentRoute = SUGGESTIONS_BY_ROUTE.find(r => r.match(location.pathname))
  let items: Suggestion[] = currentRoute?.items || SECTION_DASHBOARD
  let sectionName = currentRoute?.section || 'Главная'
  if (location.pathname.startsWith('/orders/')) {
    items = SECTION_ORDER_DETAIL
    sectionName = 'Карточка заказа'
  } else if (location.pathname === '/orders') {
    items = SECTION_ORDERS_LIST
    sectionName = 'Заказы'
  }

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Подсказчик — что делать дальше"
        style={{
          position: 'fixed', right: 220, bottom: 16, zIndex: 100,
          background: '#16a085', color: '#fff',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, padding: '8px 14px',
          fontSize: '0.9em', fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)', cursor: 'pointer',
          opacity: 0.85, transition: 'opacity 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.85' }}
      >💡 Что делать?</button>

      {open && (
        <div
          className="modal-overlay"
          onClick={() => setOpen(false)}
          style={{ zIndex: 1500 }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 560, maxHeight: '85vh', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15em' }}>💡 Что делать дальше</h2>
                <div style={{ fontSize: '0.85em', color: '#7f8c8d', marginTop: 2 }}>
                  Раздел: <strong>{sectionName}</strong>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent', border: 'none',
                  fontSize: 20, color: '#7f8c8d', cursor: 'pointer', padding: 0, lineHeight: 1,
                }}
                title="Закрыть"
              >×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((s, idx) => {
                const key = sectionName + ':' + idx
                const isOpen = s.alwaysOpen || expanded.has(key)
                return (
                  <div
                    key={key}
                    style={{
                      border: '1px solid #e5e8eb', borderRadius: 6,
                      background: isOpen ? '#f4faf8' : '#fafafa',
                    }}
                  >
                    <button
                      onClick={() => {
                        if (s.navigateTo) { setOpen(false); navigate(s.navigateTo); return }
                        if (!s.alwaysOpen) toggle(key)
                      }}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none', cursor: s.alwaysOpen && !s.navigateTo ? 'default' : 'pointer',
                        padding: '10px 12px', fontSize: '0.95em', fontWeight: 600, color: '#16a085',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span>{s.title}</span>
                      {!s.alwaysOpen && (
                        <span style={{ fontSize: '0.85em', color: '#7f8c8d', marginLeft: 8 }}>
                          {isOpen ? '▴' : '▾'}
                        </span>
                      )}
                      {s.navigateTo && (
                        <span style={{ fontSize: '0.78em', color: '#7f8c8d', marginLeft: 8 }}>→</span>
                      )}
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 12px 12px', fontSize: '0.88em', color: '#34495e', lineHeight: 1.45 }}>
                        {s.body}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: '0.78em', color: '#95a5a6' }}>
              Подсказки контекстные — меняются от страницы.
              На каждый шаг — короткое описание; «Наполнить заказ» / «Печать маршрутного листа» — раскрыты сразу как наиболее частые.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
