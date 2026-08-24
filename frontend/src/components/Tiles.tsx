/**
 * Универсальный компонент-замена для `<select>` на 2-5 значений: рендерит
 * варианты как кликабельные плитки. Был придуман на встрече с архитектором
 * (Миша, 11 мая): дропдауны на ≤5 вариантов «бесят непрерывно кликающих
 * операторов» — поэтому делаем плашки.
 *
 * Используется в `PayModal`, `DeliverAndPayModal`, time-slot'ах,
 * pricing-type в ReferencesPage и т.п. Поддерживает:
 *   • одиночный выбор (`mode="single"`) — заменяет обычный `<select>`;
 *   • множественный (`mode="multi"`) — оператор кликает несколько штук подряд;
 *   • опциональную «пустую» опцию (показывается как отдельная серая плитка).
 *
 * Все стили — inline (compact CSS у нас тут не заведено), чтобы можно было
 * вставлять прямо в существующие формы без правки index.css.
 */

import type { CSSProperties } from 'react'

export interface TileOption<V extends string | number> {
    value: V
    label: string
    /** Любая дополнительная подсказка, показывается мелким серым текстом. */
    hint?: string
}

interface TilesPropsSingle<V extends string | number> {
    mode?: 'single'
    options: TileOption<V>[]
    value: V | null
    onChange: (v: V) => void
    /** Если задан — добавляется пустая плитка с этим лейблом, value = null. */
    nullLabel?: string
    onNull?: () => void
    /** Ширина плитки в px. Default — auto, пусть растягиваются по содержимому. */
    tileWidth?: number
    style?: CSSProperties
}

interface TilesPropsMulti<V extends string | number> {
    mode: 'multi'
    options: TileOption<V>[]
    value: V[]
    onChange: (v: V[]) => void
    tileWidth?: number
    style?: CSSProperties
    // Лишние поля для совместимости с single — игнорируются.
    nullLabel?: never
    onNull?: never
}

type TilesProps<V extends string | number> = TilesPropsSingle<V> | TilesPropsMulti<V>

export default function Tiles<V extends string | number>(props: TilesProps<V>) {
    const { options, tileWidth, style } = props
    const isMulti = props.mode === 'multi'

    const isSelected = (v: V): boolean =>
        isMulti
            ? (props as TilesPropsMulti<V>).value.includes(v)
            : (props as TilesPropsSingle<V>).value === v

    const onTileClick = (v: V) => {
        if (isMulti) {
            const cur = (props as TilesPropsMulti<V>).value
            const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]
            ;(props as TilesPropsMulti<V>).onChange(next)
        } else {
            ;(props as TilesPropsSingle<V>).onChange(v)
        }
    }

    return (
        <div
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                ...style,
            }}
        >
            {!isMulti && (props as TilesPropsSingle<V>).nullLabel && (
                <button
                    type="button"
                    onClick={() => (props as TilesPropsSingle<V>).onNull?.()}
                    className="tile"
                    data-active={(props as TilesPropsSingle<V>).value == null}
                    style={tileStyle((props as TilesPropsSingle<V>).value == null, '#95a5a6', tileWidth)}
                >
                    {(props as TilesPropsSingle<V>).nullLabel}
                </button>
            )}
            {options.map(opt => {
                const active = isSelected(opt.value)
                return (
                    <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => onTileClick(opt.value)}
                        className="tile"
                        data-active={active}
                        style={tileStyle(active, '#3498db', tileWidth)}
                        title={opt.hint}
                    >
                        <div>{opt.label}</div>
                        {opt.hint && (
                            <div style={{ fontSize: '0.75em', opacity: 0.75, marginTop: 2 }}>
                                {opt.hint}
                            </div>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

/**
 * Стиль плитки: активная — синяя заливка, неактивная — светлая с тёмной
 * рамкой. Не используем index.css, чтобы компонент был самодостаточен.
 */
function tileStyle(active: boolean, activeColor: string, width: number | undefined): CSSProperties {
    return {
        padding: '8px 14px',
        minWidth: width ?? 'auto',
        borderRadius: 6,
        // Неактивная плитка — светло-голубой контур вместо серого: серый читался
        // как «выключено» и выбивался из общего бело-голубого стиля.
        border: active ? `2px solid ${activeColor}` : '1px solid #cfe4f5',
        background: active ? activeColor : '#fff',
        color: active ? '#fff' : '#2c3e50',
        cursor: 'pointer',
        fontWeight: active ? 600 : 500,
        fontSize: 14,
        transition: 'background 0.15s, border-color 0.15s',
        outline: 'none',
        // Сглаживаем разницу высоты между активной (border 2px) и неактивной (1px),
        // чтобы плитки не «прыгали» при клике.
        boxSizing: 'border-box',
        lineHeight: 1.2,
    }
}

/**
 * Утилита: цвет фона по хэшу строки. Используется в плитках «Тип позиции»
 * (AddItemModal), где у нас 8-10 типов и хочется визуальной разнобойности —
 * Миша подсказал: «люди не любят читать, тыкают по цвету».
 *
 * Возвращает мягкий пастельный HSL — фон + контрастный текст.
 */
export function hashColor(s: string): { bg: string; text: string } {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    const hue = Math.abs(h) % 360
    return {
        bg: `hsl(${hue}, 55%, 88%)`,
        text: `hsl(${hue}, 50%, 25%)`,
    }
}
