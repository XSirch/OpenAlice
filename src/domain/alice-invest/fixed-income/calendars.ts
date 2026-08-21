import { z } from 'zod'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')

export const fixedIncomeCalendarSchema = z.object({
  id: z.string().trim().min(1).max(128),
  version: z.string().trim().min(1).max(64),
  validFrom: dateOnly,
  validTo: dateOnly,
  weekendDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  holidays: z.array(z.object({ date: dateOnly, name: z.string().trim().min(1).max(160) }).strict()).max(10_000),
  source: z.object({
    sourceId: z.string().trim().min(1).max(160),
    reviewedAt: dateOnly,
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict().superRefine((calendar, context) => {
  if (calendar.validTo < calendar.validFrom) context.addIssue({ code: 'custom', path: ['validTo'], message: 'validTo must not be before validFrom' })
  if (new Set(calendar.weekendDays).size !== calendar.weekendDays.length) context.addIssue({ code: 'custom', path: ['weekendDays'], message: 'weekend days must be unique' })
  const holidays = new Set<string>()
  calendar.holidays.forEach((holiday, index) => {
    if (holiday.date < calendar.validFrom || holiday.date > calendar.validTo) context.addIssue({ code: 'custom', path: ['holidays', index, 'date'], message: 'holiday must be inside calendar validity' })
    if (holidays.has(holiday.date)) context.addIssue({ code: 'custom', path: ['holidays', index, 'date'], message: 'duplicate holiday date' })
    holidays.add(holiday.date)
  })
})

export type FixedIncomeCalendar = z.infer<typeof fixedIncomeCalendarSchema>
export type BusinessDayConvention = 'following' | 'preceding' | 'unadjusted'

export function businessDaysBetween(startExclusive: string, endInclusive: string, calendarInput: FixedIncomeCalendar): number {
  const calendar = fixedIncomeCalendarSchema.parse(calendarInput)
  assertInRange(startExclusive, calendar)
  assertInRange(endInclusive, calendar)
  if (endInclusive < startExclusive) return -businessDaysBetween(endInclusive, startExclusive, calendar)
  let count = 0
  let cursor = addDays(startExclusive, 1)
  while (cursor <= endInclusive) {
    if (isBusinessDay(cursor, calendar)) count += 1
    cursor = addDays(cursor, 1)
  }
  return count
}

export function adjustBusinessDate(date: string, convention: BusinessDayConvention, calendarInput: FixedIncomeCalendar): string {
  const calendar = fixedIncomeCalendarSchema.parse(calendarInput)
  assertInRange(date, calendar)
  if (convention === 'unadjusted' || isBusinessDay(date, calendar)) return date
  const increment = convention === 'following' ? 1 : -1
  let cursor = date
  do {
    cursor = addDays(cursor, increment)
    assertInRange(cursor, calendar)
  } while (!isBusinessDay(cursor, calendar))
  return cursor
}

export function addBusinessDays(date: string, days: number, calendarInput: FixedIncomeCalendar): string {
  const calendar = fixedIncomeCalendarSchema.parse(calendarInput)
  if (!Number.isInteger(days) || days < 0) throw new Error('business days must be a non-negative integer')
  let cursor = adjustBusinessDate(date, 'following', calendar)
  let remaining = days
  while (remaining > 0) {
    cursor = addDays(cursor, 1)
    assertInRange(cursor, calendar)
    if (isBusinessDay(cursor, calendar)) remaining -= 1
  }
  return cursor
}

function isBusinessDay(date: string, calendar: FixedIncomeCalendar): boolean {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return !calendar.weekendDays.includes(weekday) && !calendar.holidays.some((holiday) => holiday.date === date)
}

function assertInRange(date: string, calendar: FixedIncomeCalendar): void {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('date must be a valid ISO calendar date')
  if (date < calendar.validFrom || date > calendar.validTo) throw new Error(`date is outside calendar validity ${calendar.validFrom}..${calendar.validTo}`)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
