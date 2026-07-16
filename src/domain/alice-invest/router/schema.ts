import { z } from 'zod'

export const investRouterActionSchema = z.enum(['pass_through', 'rewrite_and_dispatch', 'split_into_tasks', 'local_command', 'ask_clarification', 'block_execution_request'])
export const investRouterDestinationSchema = z.enum(['workspace_session', 'fixed_income', 'market_research', 'inbox'])

export const investRouterDecisionSchema = z.object({
  action: investRouterActionSchema,
  destinations: z.array(investRouterDestinationSchema).max(4),
  clarification: z.string().trim().min(1).max(500).optional(),
  tasks: z.array(z.object({ destination: investRouterDestinationSchema, instruction: z.string().trim().min(1).max(1_000) }).strict()).max(3).default([]),
  risk: z.literal('none'),
}).strict().superRefine((value, context) => {
  if (value.action === 'ask_clarification' && !value.clarification) context.addIssue({ code: 'custom', path: ['clarification'], message: 'clarification is required' })
  if (value.action === 'split_into_tasks' && value.tasks.length < 2) context.addIssue({ code: 'custom', path: ['tasks'], message: 'at least two tasks are required' })
  if (value.action !== 'split_into_tasks' && value.tasks.length > 0) context.addIssue({ code: 'custom', path: ['tasks'], message: 'tasks are only valid for split_into_tasks' })
  if ((value.action === 'local_command' || value.action === 'block_execution_request') && value.destinations.length > 0) context.addIssue({ code: 'custom', path: ['destinations'], message: 'local/block actions cannot dispatch' })
})
export type InvestRouterDecision = z.infer<typeof investRouterDecisionSchema>
