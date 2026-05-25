import type { Command } from "commander";
import { qaDeck } from "../../qa/qa-deck.js";

export function registerQaCommand(program: Command): void {
  program
    .command("qa")
    .description("Run mandatory Deck Factory QA against a rendered PPTX.")
    .requiredOption("--deck <path>", "Rendered deck.pptx.")
    .requiredOption("--spec <path>", "Deck spec JSON used to render the deck.")
    .requiredOption("--out <dir>", "Output run directory for qa-report.json and screenshots.")
    .action(async (options: { deck: string; spec: string; out: string }) => {
      const result = await qaDeck({ deckPath: options.deck, specPath: options.spec, outDir: options.out });
      console.log(JSON.stringify(result, null, 2));
    });
}
