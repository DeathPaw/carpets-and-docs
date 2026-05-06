/**
 * Валидация ИНН по контрольной сумме.
 * 10 цифр — юр.лицо. 12 цифр — физ.лицо/ИП.
 * Алгоритм: ФНС, методика расчёта контрольных разрядов.
 */

const onlyDigits = (s: string) => s.replace(/\D/g, '')

const checksum10 = (digits: number[]) => {
  const w = [2, 4, 10, 3, 5, 9, 4, 6, 8]
  let sum = 0
  for (let i = 0; i < 9; i++) sum += digits[i] * w[i]
  return (sum % 11) % 10
}

const checksum12_a = (digits: number[]) => {
  const w = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
  let sum = 0
  for (let i = 0; i < 10; i++) sum += digits[i] * w[i]
  return (sum % 11) % 10
}

const checksum12_b = (digits: number[]) => {
  const w = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
  let sum = 0
  for (let i = 0; i < 11; i++) sum += digits[i] * w[i]
  return (sum % 11) % 10
}

export const isValidInn = (raw: string | null | undefined): boolean => {
  if (!raw) return false
  const d = onlyDigits(raw)
  if (d.length !== 10 && d.length !== 12) return false
  const digits = d.split('').map(Number)
  if (d.length === 10) {
    return checksum10(digits) === digits[9]
  }
  return checksum12_a(digits) === digits[10]
      && checksum12_b(digits) === digits[11]
}
