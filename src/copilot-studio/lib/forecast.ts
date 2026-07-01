/**
 * Forward-looking forecast. Grounded in the same verified per-step credit model
 * as the actuals engine, so forecast and actuals are directly comparable.
 *
 * credits/month = conversations × billable steps/conversation × credits/step
 */
export interface ForecastInputs {
  conversationsPerMonth: number;
  billableStepsPerConversation: number;
  creditPerStep: number;
  pricePerCredit: number;
  currency: string;
}

export const DEFAULT_FORECAST: ForecastInputs = {
  conversationsPerMonth: 1000,
  billableStepsPerConversation: 4,
  creditPerStep: 7,
  pricePerCredit: 0,
  currency: "€",
};

export interface ForecastResult {
  creditsPerMonth: number;
  creditsPerDay: number;
  costPerMonth: number | null;
}

export function forecast(i: ForecastInputs): ForecastResult {
  const creditsPerMonth = Math.round(
    i.conversationsPerMonth * i.billableStepsPerConversation * i.creditPerStep
  );
  return {
    creditsPerMonth,
    creditsPerDay: Math.round(creditsPerMonth / 30),
    costPerMonth: i.pricePerCredit > 0 ? creditsPerMonth * i.pricePerCredit : null,
  };
}

/**
 * Derive the observed average billable steps per conversation from actual runs,
 * so the forecast can be seeded from reality.
 */
export function observedStepsPerConversation(
  totalCompletedSteps: number,
  transcripts: number
): number {
  if (transcripts <= 0) return 0;
  return Math.round((totalCompletedSteps / transcripts) * 10) / 10;
}
