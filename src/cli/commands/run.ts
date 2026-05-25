import type { Command } from "commander";
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
    .action(
      async (options: {
        style: string;
        out: string;
        handoff?: string;
        spec?: string;
        plannerAgent?: string;
      }) => {
        const result = await runDeckFactory({
          styleId: options.style,
          outDir: options.out,
          handoffPath: options.handoff,
          specPath: options.spec,
          plannerAgent: options.plannerAgent
        });
        console.log(JSON.stringify(result, null, 2));
      }
    );
}
