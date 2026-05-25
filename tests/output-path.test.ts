import { describe, expect, it } from "vitest";
import { defaultRunOutputDirectory, resolveRunOutputDirectory, slugify } from "../src/workflow/output-path.js";

describe("run output paths", () => {
  it("slugifies public run directory parts", () => {
    expect(slugify("Chick-fil-A")).toBe("chick-fil-a");
    expect(slugify("5C Research Report")).toBe("5c-research-report");
    expect(defaultRunOutputDirectory({ subject: "Chick-fil-A", reportType: "5C Research Report", styleId: "snizco-agency" })).toBe(
      "artifacts/chick-fil-a-5c-research-report-snizco-agency"
    );
  });

  it("derives output directories from skill handoffs", async () => {
    await expect(
      resolveRunOutputDirectory({
        handoffPath: "samples/5c-research/chick-fil-a-handoff.json",
        styleId: "snizco-agency"
      })
    ).resolves.toBe("artifacts/chick-fil-a-5c-research-report-snizco-agency");
  });
});
