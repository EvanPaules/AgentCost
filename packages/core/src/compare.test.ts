import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTracker } from "./AgentCost.js";
import { compareModels, equivalentCost, formatComparison } from "./compare.js";

describe("equivalentCost", () => {
  it("re-prices report totals against a different model", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 1_000_000, 1_000_000); // $2.50 + $10 = $12.50

    const report = tracker.getReport();
    // gpt-4o-mini: $0.15 + $0.60 = $0.75
    assert.equal(equivalentCost(report, "gpt-4o-mini"), 0.75);
    // claude-opus-4-6: $15 + $75 = $90
    assert.equal(equivalentCost(report, "claude-opus-4-6"), 90);
  });

  it("honors customPricing overrides", () => {
    const tracker = createTracker({
      customPricing: { "llama3.2": { inputPer1M: 0, outputPer1M: 0 } },
    });
    tracker.track("llama3.2", 2_000_000, 1_000_000);

    const report = tracker.getReport();
    const cost = equivalentCost(report, "my-model", {
      "my-model": { inputPer1M: 1, outputPer1M: 2 },
    });
    // 2 * $1 + 1 * $2 = $4
    assert.equal(cost, 4);
  });

  it("throws on unknown model", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 100, 100);
    assert.throws(
      () => equivalentCost(tracker.getReport(), "no-such-model"),
      /Unknown model/,
    );
  });
});

describe("compareModels", () => {
  it("ranks alternatives cheapest-first and computes deltas", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 1_000_000, 1_000_000); // $12.50

    const table = compareModels(tracker.getReport());

    assert.equal(table.actualModel, "gpt-4o");
    assert.equal(table.actualCost, 12.5);
    assert.ok(table.alternatives.length > 0);
    // sorted cheapest-first
    for (let i = 1; i < table.alternatives.length; i++) {
      assert.ok(
        table.alternatives[i].cost >= table.alternatives[i - 1].cost,
      );
    }
    // deltas relative to actual
    const mini = table.alternatives.find((a) => a.model === "gpt-4o-mini")!;
    assert.equal(mini.cost, 0.75);
    assert.equal(mini.delta, 0.75 - 12.5);
    assert.ok(mini.deltaPercent < 0);
  });

  it('reports "mixed" when multiple models were used', () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 100, 100);
    tracker.track("claude-sonnet-4-6", 100, 100);

    const table = compareModels(tracker.getReport());
    assert.equal(table.actualModel, "mixed");
  });

  it("restricts alternatives when models option is given", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 100, 100);

    const table = compareModels(tracker.getReport(), {
      models: ["gpt-4o-mini", "claude-haiku-4-5-20251001"],
    });
    assert.equal(table.alternatives.length, 2);
  });
});

describe("formatComparison", () => {
  it("produces a readable multi-line table", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 1_000_000, 1_000_000);

    const out = formatComparison(compareModels(tracker.getReport()));
    assert.match(out, /Actual run/);
    assert.match(out, /gpt-4o-mini/);
    assert.match(out, /\$/);
  });
});
