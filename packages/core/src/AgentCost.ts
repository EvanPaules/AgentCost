import { MODEL_PRICING, type ModelPricing } from "./models.js";

export interface Step {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
  meta?: Record<string, unknown>;
}

export interface Report {
  steps: Step[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export interface BudgetAlertHandler {
  (report: Report): void;
}

export interface TrackerOptions {
  budgetLimit?: number;
  onBudgetAlert?: BudgetAlertHandler;
  customPricing?: Record<string, ModelPricing>;
}

export class AgentCost {
  private steps: Step[] = [];
  private budgetLimit: number | undefined;
  private onBudgetAlert: BudgetAlertHandler | undefined;
  private alertFired = false;
  private pricing: Record<string, ModelPricing>;

  constructor(options: TrackerOptions = {}) {
    this.budgetLimit = options.budgetLimit;
    this.onBudgetAlert = options.onBudgetAlert;
    this.pricing = { ...MODEL_PRICING, ...options.customPricing };
  }

  track(model: string, inputTokens: number, outputTokens: number, meta?: Record<string, unknown>): Step {
    const pricing = this.pricing[model];
    if (!pricing) {
      throw new Error(`Unknown model: "${model}". Provide pricing via customPricing option.`);
    }

    const cost =
      (inputTokens / 1_000_000) * pricing.inputPer1M +
      (outputTokens / 1_000_000) * pricing.outputPer1M;

    const step: Step = {
      model,
      inputTokens,
      outputTokens,
      cost,
      timestamp: Date.now(),
      meta,
    };

    this.steps.push(step);
    this.checkBudget();
    return step;
  }

  getReport(): Report {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    for (const step of this.steps) {
      totalInputTokens += step.inputTokens;
      totalOutputTokens += step.outputTokens;
      totalCost += step.cost;
    }

    return {
      steps: [...this.steps],
      totalInputTokens,
      totalOutputTokens,
      totalCost,
    };
  }

  reset(): void {
    this.steps = [];
    this.alertFired = false;
  }

  private checkBudget(): void {
    if (this.budgetLimit == null || this.onBudgetAlert == null || this.alertFired) {
      return;
    }
    const report = this.getReport();
    if (report.totalCost >= this.budgetLimit) {
      this.alertFired = true;
      this.onBudgetAlert(report);
    }
  }
}

export function createTracker(options?: TrackerOptions): AgentCost {
  return new AgentCost(options);
}
