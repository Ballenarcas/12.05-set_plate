/** @param {string} value */
export function formatBirthDateInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  const displayValue = digits.length > 4
    ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    : digits.length > 2
      ? `${digits.slice(0, 2)}/${digits.slice(2)}`
      : digits

  if (digits.length !== 8) return { displayValue, isoValue: '' }

  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4))
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)

  const isValidDate =
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day

  return {
    displayValue,
    isoValue: isValidDate ? `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` : '',
  }
}
