import { afterEach, describe, expect, it } from "vitest";
import { describeOpenClawAgentDefault, resolveOpenClawAgent } from "../src/openclaw/command.js";

const originalAgent = process.env.DECK_FACTORY_OPENCLAW_AGENT;

afterEach(() => {
  if (originalAgent === undefined) {
    delete process.env.DECK_FACTORY_OPENCLAW_AGENT;
  } else {
    process.env.DECK_FACTORY_OPENCLAW_AGENT = originalAgent;
  }
});

describe("OpenClaw agent resolution", () => {
  it("requires an approved existing agent when no override is configured", () => {
    delete process.env.DECK_FACTORY_OPENCLAW_AGENT;

    expect(() => resolveOpenClawAgent()).toThrow(/OpenClaw agent cannot be empty/);
    expect(describeOpenClawAgentDefault()).toContain("none; set DECK_FACTORY_OPENCLAW_AGENT");
  });

  it("prefers CLI override over environment configuration", () => {
    process.env.DECK_FACTORY_OPENCLAW_AGENT = "jay-worker";

    expect(resolveOpenClawAgent("custom-worker")).toBe("custom-worker");
    expect(resolveOpenClawAgent()).toBe("jay-worker");
  });
});
