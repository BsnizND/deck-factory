export type ComputerUseMode = "off" | "optional" | "required";

export interface ComputerUseCapability {
  mode: ComputerUseMode;
  enabled: boolean;
  required: boolean;
  usedByDeckFactory: false;
  note: string;
}

const DEFAULT_COMPUTER_USE_MODE: ComputerUseMode = "off";

export function resolveComputerUseMode(input?: string): ComputerUseMode {
  const raw = (input ?? process.env.DECK_FACTORY_COMPUTER_USE ?? DEFAULT_COMPUTER_USE_MODE).trim().toLowerCase();
  if (raw === "" || raw === "off" || raw === "false" || raw === "0" || raw === "no") {
    return "off";
  }
  if (raw === "optional" || raw === "on" || raw === "true" || raw === "1" || raw === "yes") {
    return "optional";
  }
  if (raw === "required" || raw === "require") {
    return "required";
  }
  throw new Error(`Invalid Computer Use mode: ${input ?? process.env.DECK_FACTORY_COMPUTER_USE}. Use off, optional, or required.`);
}

export function describeComputerUseCapability(mode: ComputerUseMode): ComputerUseCapability {
  if (mode === "off") {
    return {
      mode,
      enabled: false,
      required: false,
      usedByDeckFactory: false,
      note:
        "Computer Use is disabled for this Deck Factory run. Rendering, package checks, screenshot rasterization, OpenClaw review, and repair must not depend on desktop UI control."
    };
  }
  if (mode === "optional") {
    return {
      mode,
      enabled: true,
      required: false,
      usedByDeckFactory: false,
      note:
        "Computer Use may be used by the orchestrating agent as a separate post-run desktop verification step, but Deck Factory rendering and QA must still succeed without it."
    };
  }
  return {
    mode,
    enabled: true,
    required: true,
    usedByDeckFactory: false,
    note:
      "Computer Use is required by the caller as an external post-run verification gate. The Deck Factory CLI records this requirement but does not perform desktop UI control itself."
  };
}

export function computerUsePromptInstruction(mode: ComputerUseMode): string {
  if (mode === "off") {
    return [
      "Computer Use is disabled for this run.",
      "Do not request, invoke, or rely on @Computer, macOS desktop inspection, PowerPoint UI checks, Telegram UI checks, or any other live desktop-control path.",
      "Use only Deck Factory artifacts, rasterized screenshots, schema validation, and normal OpenClaw worker evidence."
    ].join(" ");
  }
  if (mode === "optional") {
    return [
      "Computer Use is optional for this run.",
      "Do not make deck rendering, screenshot QA, or repair depend on desktop control.",
      "If a separate orchestrator later proves Computer Use is ready, it may open the final deck as an additional verification step."
    ].join(" ");
  }
  return [
    "Computer Use is marked required by the caller as an external verification gate.",
    "Still complete Deck Factory planning, rendering, rasterization, and QA without desktop control.",
    "Do not claim the caller's external Computer Use verification is complete unless that separate tool path returns evidence."
  ].join(" ");
}
