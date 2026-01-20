export function calculateMarsHumanOutpostProgramCost(seasonalPayloadLandedOnMars, numberOfMarsTransferSeasons, totalCapitalCosts, seasonalOperatingCosts) {

  const yearsToFirstLaunch = 6
  const marsTransferSeasonSpacing = 26/12 // years
  const fiftyYearDecrease = 0.5
  const rocketCostPerKgYearlyDecrease = 1-fiftyYearDecrease**(1/50)
  const currentRocketCostPerKgToMars = 1200000 // USD per kg to surface of Mars
  const discountRate = 0.03 // 3% per year

  let totalCostWithRockets = 0
  for (let season = 0; season < numberOfMarsTransferSeasons; season++) {
    const yearsUntilLaunch = yearsToFirstLaunch + (season * marsTransferSeasonSpacing)
    const rocketCostPerKgAtLaunch = currentRocketCostPerKgToMars * (1 - rocketCostPerKgYearlyDecrease) ** yearsUntilLaunch
    const seasonCost = rocketCostPerKgAtLaunch * seasonalPayloadLandedOnMars
    const discountedSeasonCost = seasonCost / ((1 + discountRate) ** yearsUntilLaunch)
    totalCostWithRockets += discountedSeasonCost
  }

  let totalCostWithVPSL = 0
  // Infrastructure development cost
  const yearlyConstructionCost = [
    0.01e9,  // Detailed engineering studies
    0.1e9,  // Factory design and tooling, permitting
    2e9,  // Factory construction
    totalCapitalCosts/2, // Manufacturing
    totalCapitalCosts/2, // Manufacturing
    2e9,  // Testing, validation, recalls and repairs
  ]

  for (let y = 0; y < yearsToFirstLaunch; y++) {
    const discountedConstructionCost = yearlyConstructionCost[y] / ((1 + discountRate) ** y)
    totalCostWithVPSL += discountedConstructionCost
  }
  for (let season = 0; season < numberOfMarsTransferSeasons; season++) {
    const yearsUntilLaunch = yearsToFirstLaunch + (season * marsTransferSeasonSpacing)
    const discountedSeasonCost = seasonalOperatingCosts / ((1 + discountRate) ** yearsUntilLaunch)
    totalCostWithVPSL += discountedSeasonCost
  }

  return [totalCostWithRockets, totalCostWithVPSL]

}