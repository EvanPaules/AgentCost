import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTracker } from "./AgentCost.js";
import { analyzeReport, formatReport, filterSteps, exportReport } from "./report.js";

describe("analyzeReport", () => {
  it("groups costs by model and sorts by cost descending", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 1_000_000, 500_000);        // $2.50 + $5.00 = $7.50
    tracker.track("gpt-4o-mini", 1_000_000, 1_000_000);  // $0.15 + $0.60 = $0.75
    tracker.track("gpt-4o", 500_000, 500_000);            // $1.25 + $5.00 = $6.25

    const detailed = analyzeReport(tracker.getReport());

    assert.equal(detailed.byModel.length, 2);
    assert.equal(detailed.byModel[0].model, "gpt-4o");
    assert.equal(detailed.byModel[0].calls, 2);
    assert.equal(
      Math.round(detailed.byModel[0].cost * 100) / 100,
      13.75,
    );
    assert.equal(detailed.byModel[1].model, "gpt-4o-mini");
    assert.equal(detailed.byModel[1].calls, 1);
  });

  it("returns percentOfTotal for each model", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 1_000_000, 0);      // $2.50
    tracker.track("gpt-4o-mini", 1_000_000, 0);  // $0.15

    const detailed = analyzeReport(tracker.getReport());
    const total = detailed.byModel.reduce((s, m) => s + m.percentOfTotal, 0);
    assert.ok(Math.abs(total - 100) < 0.1);
  });

  it("returns null duration for empty report", () => {
    const tracker = createTracker();
    const detailed = analyzeReport(tracker.getReport());
    assert.equal(detailed.duration, null);
  });
});

describe("formatReport", () => {
  it("returns a string with cost info", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 100_000, 50_000);

    const output = formatReport(tracker.getReport());
    assert.ok(output.includes("AgentCost Report"));
    assert.ok(output.includes("Total Cost"));
    assert.ok(output.includes("gpt-4o"));
  });
});

describe("filterSteps", () => {
  it("filters by meta key/value", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 100, 100, { agent: "planner" });
    tracker.track("gpt-4o", 200, 200, { agent: "coder" });
    tracker.track("gpt-4o", 300, 300, { agent: "planner" });

    const filtered = filterSteps(tracker.getReport().steps, "agent", "planner");
    assert.equal(filtered.length, 2);
  });

  it("returns empty array when no match", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 100, 100, { agent: "planner" });

    const filtered = filterSteps(tracker.getReport().steps, "agent", "reviewer");
    assert.equal(filtered.length, 0);
  });
});

describe("exportReport", () => {
  it("returns valid JSON with byModel field", () => {
    const tracker = createTracker();
    tracker.track("gpt-4o", 100_000, 50_000);

    const json = exportReport(tracker.getReport());
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.byModel));
    assert.equal(parsed.byModel.length, 1);
  });
});
