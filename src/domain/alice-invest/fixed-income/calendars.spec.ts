import { describe, expect, it } from 'vitest'

import { adjustBusinessDate, businessDaysBetween, fixedIncomeCalendarSchema } from './calendars.js'

const calendar = fixedIncomeCalendarSchema.parse({
  id: 'br-settlement-fixture',
  version: '2026.1',
  validFrom: '2025-01-01',
  validTo: '2026-12-31',
  weekendDays: [0, 6],
  holidays: [{ date: '2026-01-01', name: 'Feriado de fixture' }],
  source: { sourceId: 'calendar-fixture', reviewedAt: '2026-08-20', checksum: 'a'.repeat(64) },
})

describe('fixed-income calendars', () => {
  it('counts start-exclusive/end-inclusive business days with holidays', () => {
    expect(businessDaysBetween('2025-12-31', '2026-01-05', calendar)).toBe(2)
  })

  it('applies following and preceding conventions within the versioned range', () => {
    expect(adjustBusinessDate('2026-01-03', 'following', calendar)).toBe('2026-01-05')
    expect(adjustBusinessDate('2026-01-03', 'preceding', calendar)).toBe('2026-01-02')
    expect(() => adjustBusinessDate('2027-01-01', 'following', calendar)).toThrow(/validity/)
  })
})
