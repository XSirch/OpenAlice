/** Pure monthly-compounding math for the Portfolio wealth forecast. */
export interface WealthForecastInput {
  currentWealth: number
  targetWealth: number
  months: number
  expectedAnnualRatePercent: number
}

export interface WealthForecast {
  monthlyRate: number
  requiredMonthlyContribution: number
  projectedWithoutContributions: number
  projectedWithRequiredContributions: number
}

export function calculateWealthForecast(input: WealthForecastInput): WealthForecast | null {
  const { currentWealth, targetWealth, months, expectedAnnualRatePercent } = input
  if (![currentWealth, targetWealth, months, expectedAnnualRatePercent].every(Number.isFinite) || months <= 0 || targetWealth < 0) return null
  const monthlyRate = Math.pow(1 + expectedAnnualRatePercent / 100, 1 / 12) - 1
  const growth = Math.pow(1 + monthlyRate, months)
  const projectedWithoutContributions = currentWealth * growth
  const contribution = Math.max(0, Math.abs(monthlyRate) < 1e-12
    ? (targetWealth - currentWealth) / months
    : (targetWealth - projectedWithoutContributions) * monthlyRate / (growth - 1))
  const projectedWithRequiredContributions = projectedWithoutContributions + contribution * (
    Math.abs(monthlyRate) < 1e-12 ? months : (growth - 1) / monthlyRate
  )
  return { monthlyRate, requiredMonthlyContribution: contribution, projectedWithoutContributions, projectedWithRequiredContributions }
}

export function monthsUntil(targetDate: string, now = new Date()): number | null {
  const target = new Date(`${targetDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const months = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth()
  return months > 0 ? months : null
}
