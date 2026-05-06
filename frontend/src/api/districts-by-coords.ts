// Определение района Санкт-Петербурга по координатам.
// Используется как fallback для AddressInput, когда DaData не вернула район в подсказке —
// мы знаем lat/lon из ответа DaData и определяем район по упрощённой bbox-таблице.
//
// Раньше здесь была ещё функция geocodeAddress() через Nominatim — после перехода
// на DaData она больше не нужна и удалена.

// Упрощённые bbox районов Петербурга (lat_min, lat_max, lon_min, lon_max)
const SPB_DISTRICTS: Record<string, [number, number, number, number]> = {
  'Красносельский':     [59.73, 59.87, 30.05, 30.25],
  'Кировский':          [59.83, 59.90, 30.22, 30.32],
  'Московский':         [59.82, 59.89, 30.30, 30.38],
  'Фрунзенский':        [59.84, 59.89, 30.37, 30.43],
  'Невский':            [59.83, 59.93, 30.43, 30.55],
  'Центральный':        [59.92, 59.95, 30.30, 30.40],
  'Адмиралтейский':     [59.90, 59.93, 30.27, 30.34],
  'Василеостровский':   [59.92, 59.96, 30.21, 30.30],
  'Петроградский':      [59.95, 59.98, 30.28, 30.35],
  'Выборгский':         [59.97, 60.10, 30.28, 30.45],
  'Калининский':        [59.96, 60.05, 30.35, 30.45],
  'Красногвардейский':  [59.93, 60.00, 30.42, 30.55],
  'Приморский':         [59.97, 60.15, 30.15, 30.30],
  'Колпинский':         [59.70, 59.78, 30.55, 30.65],
  'Пушкинский':         [59.68, 59.78, 30.30, 30.50],
  'Петродворцовый':     [59.84, 59.90, 29.85, 30.10],
  'Курортный':          [59.95, 60.20, 29.40, 29.90],
  'Кронштадтский':      [59.98, 60.02, 29.72, 29.80],
}

export function detectDistrictByCoords(lat: number, lon: number): string | null {
  // Сначала точное попадание в bbox
  for (const [name, [latMin, latMax, lonMin, lonMax]] of Object.entries(SPB_DISTRICTS)) {
    if (lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax) {
      return name
    }
  }
  // Если между районами — ищем ближайший по центру bbox
  let nearest: string | null = null
  let minDist = Infinity
  for (const [name, [latMin, latMax, lonMin, lonMax]] of Object.entries(SPB_DISTRICTS)) {
    const cLat = (latMin + latMax) / 2
    const cLon = (lonMin + lonMax) / 2
    // 0.55 — коррекция долготы для широты ~60°
    const dist = Math.sqrt((lat - cLat) ** 2 + ((lon - cLon) * 0.55) ** 2)
    if (dist < minDist) {
      minDist = dist
      nearest = name
    }
  }
  // Возвращаем только если действительно близко — не дальше чем за пределами города.
  return minDist < 0.15 ? nearest : null
}
