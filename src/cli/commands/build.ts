import type { Command } from "commander";
import { buildDeck } from "../../workflow/build-deck.js";

export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .description("Render an editable PPTX from a validated deck spec.")
    .requiredOption("--spec <path>", "Deck spec JSON.")
    .requiredOption("--out <dir>", "Output run directory.")
    .action(async (options: { spec: string; out: string }) => {
      const result = await buildDeck({ specPath: options.spec, outDir: options.out });
      console.log(JSON.stringify(result, null, 2));
    });
}
