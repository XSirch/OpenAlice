/** Pure monthly-compounding math for the standalone wealth forecast. */
export interface WealthForecastInput {
  currentWealth: number
  monthlyContribution: number
  months: number
  expectedAnnualRatePercent: number
}

export interface WealthForecastPoint {
  month: number
  principal: number
  interest: number
  balance: number
}

export interface WealthForecast {
  monthlyRate: number
  points: WealthForecastPoint[]
  totalContributions: number
  totalInterest: number
  projectedWealth: number
}

export function calculateWealthForecast(input: WealthForecastInput): WealthForecast | null {
  const { currentWealth, monthlyContribution, months, expectedAnnualRatePercent } = input
  if (![currentWealth, monthlyContribution, months, expectedAnnualRatePercent].every(Number.isFinite) || months <= 0 || currentWealth < 0 || monthlyContribution < 0) return null
  const monthlyRate = Math.pow(1 + expectedAnnualRatePercent / 100, 1 / 12) - 1
  let balance = currentWealth
  const points: WealthForecastPoint[] = [{ month: 0, principal: currentWealth, interest: 0, balance }]
  for (let month = 1; month <= months; month++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution
    const principal = currentWealth + monthlyContribution * month
    points.push({ month, principal, interest: balance - principal, balance })
  }
  const projectedWealth = points.at(-1)?.balance ?? currentWealth
  return {
    monthlyRate,
    points,
    totalContributions: monthlyContribution * months,
    totalInterest: projectedWealth - currentWealth - monthlyContribution * months,
    projectedWealth,
  }
}
