import { describe, expect, it } from "vitest";
import { createProductQualityReport, resolveProductQualityMode } from "../src/product/product-quality.js";

describe("product quality gate", () => {
  it("flags sample-fixture decks as failed in strict mode", () => {
    const report = createProductQualityReport(
      {
        deck: {
          title: "Chick-fil-A 5C Research Snapshot",
          objective: "Sample fixture, not live research.",
          speakerNotes: false
        },
        slides: [
          {
            id: "title",
            source: "generated",
            title: "Chick-fil-A 5C Research Snapshot",
            purpose: "Open the deck and clearly label the work as a sample fixture.",
            content: [{ value: "Executive research deck | Sample fixture, not live research" }],
            citations: []
          },
          {
            id: "company-customers",
            source: "generated",
            title: "Company And Customers",
            content: [{ value: "Sample company context." }],
            citations: []
          }
        ]
      },
      "strict"
    );

    expect(report.status).toBe("failed");
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: "visible-fixture-caveat" })]));
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ id: "missing-citations" })]));
  });

  it("passes a sourced client-style package", () => {
    const report = createProductQualityReport(
      {
        deck: {
          title: "Retail Growth Strategy",
          objective: "Recommend next actions from approved research.",
          speakerNotes: true
        },
        slides: [
          {
            id: "recommendation",
            source: "generated",
            title: "Recommendation",
            purpose: "State the decision.",
            speakerNotes: "Lead with the margin impact, then explain the tradeoff.",
            sourceSections: ["company", "customers"],
            citations: ["source-1"],
            assets: [{ assetId: "chart-1" }],
            content: [{ value: "Prioritize the highest-margin customer segment." }, { value: "Defer low-return channels." }]
          },
          {
            id: "evidence",
            source: "generated",
            title: "Evidence",
            purpose: "Support the decision.",
            speakerNotes: "Walk through the table from left to right.",
            sourceSections: ["competitors"],
            citations: ["source-2"],
            assets: [{ assetId: "table-1" }],
            content: [{ value: "Customer demand is concentrated." }, { value: "Competitor pressure is manageable." }]
          }
        ]
      },
      "strict"
    );

    expect(report.status).toBe("passed");
    expect(report.findings).toEqual([]);
  });

  it("downgrades product-quality blockers to warnings outside strict mode", () => {
    const report = createProductQualityReport(
      {
        deck: {
          title: "Fixture",
          objective: "Sample fixture, not live research.",
          speakerNotes: false
        },
        slides: [
          {
            id: "s1",
            source: "generated",
            title: "Fixture",
            content: [{ value: "Sample fixture, not live research." }],
            citations: []
          }
        ]
      },
      "warn"
    );

    expect(report.status).toBe("warning");
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "BLOCKER" })]));
  });

  it("resolves modes from explicit values and environment-compatible aliases", () => {
    expect(resolveProductQualityMode("off")).toBe("off");
    expect(resolveProductQualityMode("warning")).toBe("warn");
    expect(resolveProductQualityMode("required")).toBe("strict");
  });
});
