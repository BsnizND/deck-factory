import type { Command } from "commander";
import { registerTemplate, loadTemplateRegistry, inspectTemplate, refreshTemplate } from "../../registry/template-registry.js";
import { defaultStylePack, saveStylePack } from "../../registry/style-pack.js";

export function registerTemplatesCommand(program: Command): void {
  const templates = program.command("templates").description("Register, inspect, and refresh reusable template styles.");

  templates
    .command("register")
    .description("Register a prepared .pptx template deck and cache its extracted profile.")
    .requiredOption("--id <id>", "Stable style/template id, e.g. snizco-agency.")
    .requiredOption("--name <name>", "Display name.")
    .requiredOption("--template-deck <path>", "Prepared .pptx template deck.")
    .option("--force", "Force re-extraction even if the fingerprint is current.")
    .action(async (options: { id: string; name: string; templateDeck: string; force?: boolean }) => {
      const entry = await registerTemplate({
        templateId: options.id,
        displayName: options.name,
        templateDeckPath: options.templateDeck,
        force: options.force
      });
      await saveStylePack(
        defaultStylePack({
          styleId: entry.templateId,
          displayName: entry.displayName,
          templateId: entry.templateId,
          supportedArchetypes: entry.supportedArchetypes
        })
      );
      console.log(JSON.stringify(entry, null, 2));
    });

  templates
    .command("list")
    .description("List registered templates.")
    .action(async () => {
      console.log(JSON.stringify(await loadTemplateRegistry(), null, 2));
    });

  templates
    .command("inspect")
    .description("Inspect a registered template.")
    .argument("<id>", "Template/style id.")
    .action(async (id: string) => {
      console.log(JSON.stringify(await inspectTemplate(id), null, 2));
    });

  templates
    .command("refresh")
    .description("Force-refresh a registered template profile.")
    .argument("<id>", "Template/style id.")
    .action(async (id: string) => {
      console.log(JSON.stringify(await refreshTemplate(id), null, 2));
    });
}
