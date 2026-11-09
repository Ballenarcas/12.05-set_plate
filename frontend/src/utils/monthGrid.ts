/** Whole weeks (Monday first) covering a month, including the faded days of the months around it. */
export function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7))
  const last = new Date(year, month + 1, 0)
  const weeks: Date[][] = []
  for (let day = new Date(start); day <= last || weeks.at(-1)?.length !== 7; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    if (!weeks.length || weeks.at(-1)!.length === 7) weeks.push([])
    weeks.at(-1)!.push(day)
  }
  return weeks
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
