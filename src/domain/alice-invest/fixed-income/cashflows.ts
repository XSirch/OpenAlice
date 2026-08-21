import { z } from 'zod'

const nonnegativeDecimalString = z.string()
  .regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')

export const fixedIncomeCashFlowSchema = z.object({
  id: z.string().trim().min(1).max(256),
  instrumentId: z.string().trim().min(1).max(256),
  lotId: z.string().trim().min(1).max(256).optional(),
  date: dateOnly,
  kind: z.enum(['interest', 'coupon', 'amortization', 'principal', 'premium', 'fee']),
  grossBRL: nonnegativeDecimalString,
  indexationRuleId: z.string().trim().min(1).max(128).optional(),
  taxRuleId: z.string().trim().min(1).max(128).optional(),
  status: z.enum(['projected', 'announced', 'paid']),
}).strict()

export const fixedIncomeCashFlowScheduleSchema = z.object({
  version: z.literal(1),
  methodologyId: z.string().trim().min(1).max(128),
  generatedAt: z.string().datetime({ offset: true }),
  cashFlows: z.array(fixedIncomeCashFlowSchema).max(100_000),
}).strict().superRefine((schedule, context) => {
  const ids = new Set<string>()
  schedule.cashFlows.forEach((cashFlow, index) => {
    if (ids.has(cashFlow.id)) {
      context.addIssue({ code: 'custom', path: ['cashFlows', index, 'id'], message: 'duplicate cash-flow id' })
    }
    ids.add(cashFlow.id)
  })
})

export type FixedIncomeCashFlow = z.infer<typeof fixedIncomeCashFlowSchema>
export type FixedIncomeCashFlowSchedule = z.infer<typeof fixedIncomeCashFlowScheduleSchema>
