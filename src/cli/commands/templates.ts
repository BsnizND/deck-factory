import type { Command } from "commander";
import { registerTemplate, loadTemplateRegistry, inspectTemplate, refreshTemplate } from "../../registry/template-registry.js";
import { defaultStylePack, loadStylePack, saveStylePack } from "../../registry/style-pack.js";
import { DeckFactoryError } from "../../errors.js";
import { initTemplateInstructions, inspectTemplateInstructions, validateTemplateInstructions } from "../../template/template-instructions.js";

export function registerTemplatesCommand(program: Command): void {
  const templates = program.command("templates").description("Register, inspect, and refresh reusable template styles.");

  templates
    .command("register")
    .description("Register a prepared .pptx template deck and cache its extracted profile.")
    .requiredOption("--id <id>", "Stable style/template id, e.g. snizco-agency.")
    .requiredOption("--name <name>", "Display name.")
    .option("--template-deck <path>", "Prepared .pptx template deck with representative dummy slides. Preferred v0 input.")
    .option("--powerpoint-template <path>", "Future .potx template input role. Fails closed in v0 with preparation guidance.")
    .option("--force", "Force re-extraction even if the fingerprint is current.")
    .action(async (options: { id: string; name: string; templateDeck?: string; powerpointTemplate?: string; force?: boolean }) => {
      if (Boolean(options.templateDeck) === Boolean(options.powerpointTemplate)) {
        throw new Error("Provide exactly one template input role: --template-deck or --powerpoint-template.");
      }
      const entry = await registerTemplate({
        templateId: options.id,
        displayName: options.name,
        templateDeckPath: options.templateDeck ?? options.powerpointTemplate!,
        sourceFileRole: options.templateDeck ? "template-deck" : "powerpoint-template",
        force: options.force
      });
      await upsertStylePackForTemplate(entry);
      console.log(JSON.stringify(entry, null, 2));
    });

  const instructions = templates.command("instructions").description("Manage human-editable template instruction sidecars.");

  instructions
    .command("init")
    .description("Create template-instructions.json for a registered style from its extracted template profile.")
    .argument("<style-id>", "Registered style/template id.")
    .option("--force", "Overwrite existing instructions.")
    .action(async (styleId: string, options: { force?: boolean }) => {
      console.log(JSON.stringify(await initTemplateInstructions(styleId, { force: options.force }), null, 2));
    });

  instructions
    .command("validate")
    .description("Validate template-instructions.json for a registered style.")
    .argument("<style-id>", "Registered style/template id.")
    .action(async (styleId: string) => {
      const loaded = await inspectTemplateInstructions(styleId);
      await validateTemplateInstructions(loaded, styleId);
      console.log(JSON.stringify({ status: "passed", styleId, layoutCount: loaded.layoutInstructions.length }, null, 2));
    });

  instructions
    .command("inspect")
    .description("Inspect template-instructions.json for a registered style.")
    .argument("<style-id>", "Registered style/template id.")
    .action(async (styleId: string) => {
      console.log(JSON.stringify(await inspectTemplateInstructions(styleId), null, 2));
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

async function upsertStylePackForTemplate(entry: {
  templateId: string;
  displayName: string;
  supportedArchetypes: string[];
}): Promise<void> {
  try {
    const existing = await loadStylePack(entry.templateId);
    await saveStylePack({
      ...existing,
      displayName: entry.displayName,
      templateId: entry.templateId,
      supportedArchetypes: entry.supportedArchetypes,
      layoutMap: {
        ...Object.fromEntries(entry.supportedArchetypes.map((name) => [name, name])),
        ...existing.layoutMap
      }
    });
  } catch (error) {
    if (!(error instanceof DeckFactoryError)) {
      throw error;
    }
    await saveStylePack(
      defaultStylePack({
        styleId: entry.templateId,
        displayName: entry.displayName,
        templateId: entry.templateId,
        supportedArchetypes: entry.supportedArchetypes
      })
    );
  }
}
