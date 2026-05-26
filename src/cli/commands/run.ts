import type { Command } from "commander";
import { resolveComputerUseMode } from "../../capabilities/computer-use.js";
import { fail } from "../../errors.js";
import { DEFAULT_OPENCLAW_AGENT, DEFAULT_OPENCLAW_COMMAND } from "../../openclaw/command.js";
import { resolveStylePack } from "../../registry/style-pack.js";
import { resolveRunOutputDirectory } from "../../workflow/output-path.js";
import { runDeckFactory } from "../../workflow/run-deck-factory.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Plan, render, and QA a deck in one Deck Factory run.")
    .requiredOption("--style <id-or-name>", "Registered style id or display name, for example snizco-agency or \"Snizco Agency\".")
    .option("--out <dir>", "Output run directory. Defaults to artifacts/<subject>-<report-type>-<style-id> for handoffs.")
    .option("--handoff <path>", "Skill deck handoff JSON. Uses OpenClaw to plan deck-spec.json.")
    .option("--spec <path>", "Existing deck spec JSON. Skips OpenClaw planning but still validates, renders, and QA checks.")
    .option("--reference-deck <path>", "Optional .pptx source/reference deck. Read-only context; never treated as the template.")
    .option("--planner-agent <agent>", `OpenClaw agent for deck planning. Defaults to ${DEFAULT_OPENCLAW_AGENT}.`)
    .option(
      "--openclaw-command <command>",
      `Command used to invoke OpenClaw. Defaults to DECK_FACTORY_OPENCLAW_COMMAND or '${DEFAULT_OPENCLAW_COMMAND}'.`
    )
    .option(
      "--computer-use <mode>",
      "Computer Use integration mode for this run: off, optional, or required. Defaults to DECK_FACTORY_COMPUTER_USE or off."
    )
    .option("--max-repair-attempts <number>", "Override deck-spec openclaw.maxRepairAttempts.")
    .action(
      async (options: {
        style: string;
        out?: string;
        handoff?: string;
        spec?: string;
        referenceDeck?: string;
        plannerAgent?: string;
        openclawCommand?: string;
        computerUse?: string;
        maxRepairAttempts?: string;
      }) => {
        const maxRepairAttempts = parseOptionalNonNegativeInteger(options.maxRepairAttempts);
        const computerUseMode = resolveComputerUseMode(options.computerUse);
        const style = await resolveStylePack(options.style);
        const outDir = await resolveRunOutputDirectory({
          outDir: options.out,
          handoffPath: options.handoff,
          specPath: options.spec,
          styleId: style.styleId
        });
        const result = await runDeckFactory({
          styleId: style.styleId,
          outDir,
          handoffPath: options.handoff,
          specPath: options.spec,
          referenceDeckPath: options.referenceDeck,
          plannerAgent: options.plannerAgent,
          openclawCommand: options.openclawCommand,
          maxRepairAttempts,
          computerUseMode
        });
        console.log(JSON.stringify(result, null, 2));
      }
    );
}

function parseOptionalNonNegativeInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`--max-repair-attempts must be a non-negative integer, received: ${value}`);
  }
  return parsed;
}
