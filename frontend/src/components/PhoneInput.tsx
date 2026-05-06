import { forwardRef } from 'react'

/**
 * Поле ввода телефона с маской «+7 (XXX) XXX-XX-XX».
 * Хранит и отдаёт в onChange отформатированную строку — её же кладём в БД,
 * это удобнее чем хранить «голые» цифры (виден формат сразу в любых отчётах).
 *
 * При вставке номера в любом виде (8XXX, 7XXX, +7XXX) — нормализуется к +7.
 */

const onlyDigits = (s: string) => s.replace(/\D/g, '')

/** Нормализация: оставляем только цифры, ведущая 8 → 7, обрезаем до 11. */
export const normalizePhone = (raw: string): string => {
  let d = onlyDigits(raw)
  if (d.startsWith('8')) d = '7' + d.slice(1)
  if (d.length > 0 && !d.startsWith('7')) d = '7' + d
  return d.slice(0, 11)
}

/**
 * Форматирование 11 цифр как +7 (XXX) XXX-XX-XX.
 * Если цифр меньше 11 — выводим столько, сколько есть, в шаблоне.
 */
export const formatPhone = (raw: string | null | undefined): string => {
  if (!raw) return ''
  const d = normalizePhone(raw)
  if (d.length === 0) return ''
  // 7 → +7, 7XXX → +7 (XXX, и т.д.
  let out = '+7'
  if (d.length > 1) out += ' (' + d.slice(1, 4)
  if (d.length >= 4) out += ')'
  if (d.length >= 5) out += ' ' + d.slice(4, 7)
  if (d.length >= 8) out += '-' + d.slice(7, 9)
  if (d.length >= 10) out += '-' + d.slice(9, 11)
  return out
}

export const isValidPhone = (raw: string | null | undefined): boolean => {
  if (!raw) return false
  return normalizePhone(raw).length === 11
}

interface Props {
  value: string
  onChange: (formatted: string) => void
  placeholder?: string
  required?: boolean
  style?: React.CSSProperties
  disabled?: boolean
  /** Показывать оранжевую границу если значение не валидно и не пустое. */
  showValidation?: boolean
}

const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput(
  { value, onChange, placeholder = '+7 (___) ___-__-__', required, style, disabled, showValidation },
  ref
) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(formatPhone(e.target.value))
  }

  // Если значение пришло уже отформатированным из БД — переформатируем (на случай старых записей).
  const display = value ? formatPhone(value) : ''
  const invalid = !!showValidation && display !== '' && !isValidPhone(display)

  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoComplete="tel"
      style={{
        ...style,
        ...(invalid ? { borderColor: '#e67e22' } : null),
      }}
    />
  )
})

export default PhoneInput
