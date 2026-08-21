import { fixedIncomeShadowInputFileSchema } from './shadow-monitor-service.js'
import type { FixedIncomeShadowObservation, FixedIncomeShadowReport } from './shadow-validation.js'

export async function collectFixedIncomeShadowArtifact(
  input: unknown,
  store: { append: (observation: FixedIncomeShadowObservation) => Promise<boolean> },
): Promise<{ accepted: number; replayed: number }> {
  const artifact = fixedIncomeShadowInputFileSchema.parse(input)
  let accepted = 0
  for (const observation of artifact.observations) if (await store.append(observation)) accepted += 1
  return { accepted, replayed: artifact.observations.length - accepted }
}

export function renderFixedIncomeShadowReportMarkdown(report: FixedIncomeShadowReport): string {
  const walkthrough = report.walkthrough
    ? `${report.walkthrough.result} by ${report.walkthrough.reviewer} at ${report.walkthrough.completedAt}`
    : 'missing'
  return [
    '# Fixed-income shadow validation evidence', '',
    `- Methodology: \`${report.methodologyId}\``,
    `- State: \`${report.state}\``,
    `- Readiness: \`${report.readiness}\``,
    `- Financial execution: unavailable`,
    `- Observation days: ${report.distinctObservationDays}/30`,
    `- Observation count: ${report.observationCount}`,
    `- Period: ${report.period.from ?? 'n/a'} to ${report.period.to ?? 'n/a'}`,
    `- Maximum absolute calculation difference: R$ ${report.maximumAbsoluteCalculationDifferenceBRL}`,
    `- Human walkthrough: ${walkthrough}`,
    `- Blockers: ${report.blockers.length ? report.blockers.map((item) => `\`${item}\``).join(', ') : 'none'}`,
    '', '## Operational metrics', '',
    `- Stale-data events: ${report.metrics.staleDataEvents}`,
    `- Provider failures: ${report.metrics.providerFailures}`,
    `- Alerts: ${report.metrics.alerts}`,
    `- Duplicate alerts: ${report.metrics.duplicateAlerts}`,
    `- Reviewed alerts: ${report.metrics.reviewedAlerts}`,
    `- False positives: ${report.metrics.falsePositives} (${report.metrics.falsePositiveRatePct}%)`,
    '', '## Threshold sensitivity', '',
    ...(report.thresholdSensitivity.length ? report.thresholdSensitivity.map((item) => `- \`${item.variant}\`: ${item.observations} observations, ${item.alerts} alerts, ${item.falsePositives} false positives (${item.falsePositiveRatePct}%)`) : ['- No observations yet.']),
    '', '> This evidence is read-only. Eligibility permits only a separate human readiness decision; it never enables financial execution.', '',
  ].join('\n')
}
