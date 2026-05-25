import type { Command } from "commander";
import { fail } from "../../errors.js";
import { runDeckFactory } from "../../workflow/run-deck-factory.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Plan, render, and QA a deck in one Deck Factory run.")
    .requiredOption("--style <id>", "Registered style id, for example snizco-agency.")
    .requiredOption("--out <dir>", "Output run directory.")
    .option("--handoff <path>", "Skill deck handoff JSON. Uses OpenClaw to plan deck-spec.json.")
    .option("--spec <path>", "Existing deck spec JSON. Skips OpenClaw planning but still validates, renders, and QA checks.")
    .option("--planner-agent <agent>", "OpenClaw agent for deck planning. Defaults to jay.")
    .option("--max-repair-attempts <number>", "Override deck-spec openclaw.maxRepairAttempts.")
    .action(
      async (options: {
        style: string;
        out: string;
        handoff?: string;
        spec?: string;
        plannerAgent?: string;
        maxRepairAttempts?: string;
      }) => {
        const maxRepairAttempts = parseOptionalNonNegativeInteger(options.maxRepairAttempts);
        const result = await runDeckFactory({
          styleId: options.style,
          outDir: options.out,
          handoffPath: options.handoff,
          specPath: options.spec,
          plannerAgent: options.plannerAgent,
          maxRepairAttempts
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
