import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTracker, AgentCost } from "./AgentCost.js";

describe("createTracker", () => {
  it("returns an AgentCost instance", () => {
    const tracker = createTracker();
    assert.ok(tracker instanceof AgentCost);
  });
});

describe("tracker.track()", () => {
  it("correctly calculates cost for a known model", () => {
    const tracker = createTracker();
    // gpt-4o: input $2.50/1M, output $10/1M
    const step = tracker.track("gpt-4o", 1_000_000, 1_000_000);

    assert.equal(step.model, "gpt-4o");
    assert.equal(step.inputTokens, 1_000_000);
    assert.equal(step.outputTokens, 1_000_000);
    assert.equal(step.cost, 2.5 + 10); // $12.50
  });

  it("throws for an unknown model", () => {
    const tracker = createTracker();
    assert.throws(() => tracker.track("unknown-model", 100, 100), /Unknown model/);
  });

  it("supports custom pricing", () => {
    const tracker = createTracker({
      customPricing: {
        "my-model": { inputPer1M: 1, outputPer1M: 2 },
      },
    });
    const step = tracker.track("my-model", 500_000, 500_000);
    assert.equal(step.cost, 0.5 + 1); // $1.50
  });
});

describe("tracker.getReport()", () => {
  let tracker: AgentCost;

  beforeEach(() => {
    tracker = createTracker();
  });

  it("returns correct totals across multiple steps", () => {
    // gpt-4o: input $2.50/1M, output $10/1M
    tracker.track("gpt-4o", 500_000, 200_000);       // $1.25 + $2.00 = $3.25
    tracker.track("gpt-4o", 300_000, 100_000);        // $0.75 + $1.00 = $1.75
    tracker.track("gpt-4o-mini", 1_000_000, 500_000); // $0.15 + $0.30 = $0.45

    const report = tracker.getReport();

    assert.equal(report.steps.length, 3);
    assert.equal(report.totalInputTokens, 1_800_000);
    assert.equal(report.totalOutputTokens, 800_000);
    assert.equal(
      Math.round(report.totalCost * 100) / 100,
      5.45,
    );
  });

  it("returns empty report with no steps", () => {
    const report = tracker.getReport();
    assert.equal(report.steps.length, 0);
    assert.equal(report.totalCost, 0);
    assert.equal(report.totalInputTokens, 0);
    assert.equal(report.totalOutputTokens, 0);
  });
});

describe("budget alert", () => {
  it("fires when threshold is exceeded", () => {
    let alertReport: { totalCost: number } | null = null;

    const tracker = createTracker({
      budgetLimit: 1.0, // $1 budget
      onBudgetAlert: (report) => {
        alertReport = report;
      },
    });

    // gpt-4o: input $2.50/1M, output $10/1M
    // This call costs $0.625 — under budget
    tracker.track("gpt-4o", 100_000, 50_000);
    assert.equal(alertReport, null);

    // This call costs $0.625 — pushes total to $1.25, over budget
    tracker.track("gpt-4o", 100_000, 50_000);
    assert.notEqual(alertReport, null);
    assert.ok(alertReport!.totalCost >= 1.0);
  });

  it("fires only once", () => {
    let alertCount = 0;

    const tracker = createTracker({
      budgetLimit: 0.01,
      onBudgetAlert: () => {
        alertCount++;
      },
    });

    tracker.track("gpt-4o", 1_000_000, 1_000_000);
    tracker.track("gpt-4o", 1_000_000, 1_000_000);
    tracker.track("gpt-4o", 1_000_000, 1_000_000);

    assert.equal(alertCount, 1);
  });
});
