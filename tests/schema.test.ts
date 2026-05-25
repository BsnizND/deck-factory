import { describe, expect, it } from "vitest";
import { countPptxSlides } from "../src/qa/qa-deck.js";
import { resolveStylePack } from "../src/registry/style-pack.js";
import { readJsonFile } from "../src/util/fs.js";
import { validateSchema } from "../src/schema/validate.js";

describe("schema fixtures", () => {
  it("validates the sample 5C handoff", async () => {
    const handoff = await readJsonFile("samples/5c-research/chick-fil-a-handoff.json");
    await expect(validateSchema("skill-deck-handoff", handoff)).resolves.toBeUndefined();
  });

  it("validates the sample deck spec", async () => {
    const spec = await readJsonFile("samples/snizco-agency/deck-spec.json");
    await expect(validateSchema("deck-spec", spec)).resolves.toBeUndefined();
  });

  it("rejects invalid handoffs", async () => {
    await expect(validateSchema("skill-deck-handoff", { version: "bad" })).rejects.toThrow(/Schema validation failed/);
  });

  it("counts slides in the sample template deck", async () => {
    await expect(countPptxSlides("samples/snizco-agency/template.pptx")).resolves.toBe(4);
  });

  it("resolves styles by display name for agent requests", async () => {
    await expect(resolveStylePack("Snizco Agency")).resolves.toMatchObject({ styleId: "snizco-agency" });
    await expect(resolveStylePack("snizco agency")).resolves.toMatchObject({ styleId: "snizco-agency" });
  });
});
