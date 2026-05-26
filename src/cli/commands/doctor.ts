import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import type { Command } from "commander";
import { resolveComputerUseMode, type ComputerUseMode } from "../../capabilities/computer-use.js";
import {
  DEFAULT_OPENCLAW_AGENT,
  DEFAULT_OPENCLAW_COMMAND,
  buildOpenClawInvocation,
  resolveOpenClawCommand,
  type OpenClawCommand
} from "../../openclaw/command.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

type CheckStatus = "ok" | "missing" | "warning";

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Report Deck Factory prerequisite readiness without mutating state.")
    .option("--json", "Print JSON output.")
    .option(
      "--worker-agent <id>",
      `OpenClaw worker agent id to verify. Defaults to DECK_FACTORY_OPENCLAW_AGENT or ${DEFAULT_OPENCLAW_AGENT}.`,
      DEFAULT_OPENCLAW_AGENT
    )
    .option(
      "--openclaw-command <command>",
      `Command used to invoke OpenClaw. Defaults to DECK_FACTORY_OPENCLAW_COMMAND or '${DEFAULT_OPENCLAW_COMMAND}'.`
    )
    .option(
      "--computer-use <mode>",
      "Computer Use integration mode to report: off, optional, or required. Defaults to DECK_FACTORY_COMPUTER_USE or off."
    )
    .action(async (options: { json?: boolean; workerAgent: string; openclawCommand?: string; computerUse?: string }) => {
      const computerUseMode = resolveComputerUseMode(options.computerUse);
      const checks = await runDoctorChecks({
        workerAgent: options.workerAgent,
        openclawCommand: resolveOpenClawCommand(options.openclawCommand),
        computerUseMode
      });
      const ok = checks.every((check) => check.status === "ok" || check.status === "warning");
      if (options.json) {
        console.log(JSON.stringify({ ok, checks }, null, 2));
        if (!ok) {
          process.exitCode = 1;
        }
        return;
      }
      for (const check of checks) {
        const marker = check.status === "ok" ? "OK" : check.status === "warning" ? "WARN" : "MISSING";
        console.log(`${marker} ${check.name}: ${check.detail}`);
      }
      if (!ok) {
        process.exitCode = 1;
      }
    });
}

async function runDoctorChecks(options: {
  workerAgent: string;
  openclawCommand: OpenClawCommand;
  computerUseMode: ComputerUseMode;
}): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push(await commandVersionCheck("node", ["--version"], "Node.js"));
  checks.push(await commandVersionCheck("npm", ["--version"], "npm"));
  checks.push(packageVersionCheck("pptx-automizer", "Renderer: pptx-automizer"));
  checks.push(packageVersionCheck("pptxgenjs", "Renderer: PptxGenJS"));
  checks.push(await openClawCheck(options.openclawCommand));
  checks.push(await openClawWorkerCheck(options.openclawCommand, options.workerAgent));
  checks.push(computerUseCheck(options.computerUseMode));
  checks.push(...(await rasterizerChecks()));
  return checks;
}

function computerUseCheck(mode: ComputerUseMode): DoctorCheck {
  if (mode === "off") {
    return {
      name: "Computer Use",
      status: "ok",
      detail: "Disabled for Deck Factory runs; rendering and QA do not require desktop UI control."
    };
  }
  if (mode === "optional") {
    return {
      name: "Computer Use",
      status: "warning",
      detail:
        "Optional only. Deck Factory will still render and QA without desktop UI control; any @Computer verification must be proven by the orchestrating agent after the deck exists."
    };
  }
  return {
    name: "Computer Use",
    status: "missing",
    detail:
      "Required by configuration, but Deck Factory has no built-in desktop-control verifier. Use --computer-use off/optional or run a separate proven @Computer verification gate after deck creation."
  };
}

function packageVersionCheck(packageName: string, name: string): DoctorCheck {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = require(packageJsonPath) as { version?: string };
    return { name, status: "ok", detail: `${packageName}@${packageJson.version ?? "unknown"}` };
  } catch (error) {
    try {
      const resolvedPath = require.resolve(packageName);
      return { name, status: "ok", detail: `${packageName} resolved at ${resolvedPath}` };
    } catch {
      return {
        name,
        status: "missing",
        detail: `${packageName} is not installed or cannot be resolved: ${(error as Error).message}`
      };
    }
  }
}

async function commandVersionCheck(
  command: string,
  args: string[],
  name: string,
  optional = false
): Promise<DoctorCheck> {
  try {
    const result = await execFileAsync(command, args, { timeout: 10_000 });
    return { name, status: "ok", detail: (result.stdout || result.stderr).trim() || `${command} found` };
  } catch (error) {
    return {
      name,
      status: optional ? "warning" : "missing",
      detail: `${command} is not available: ${(error as Error).message}`
    };
  }
}

async function openClawCheck(openclaw: OpenClawCommand): Promise<DoctorCheck> {
  try {
    const invocation = buildOpenClawInvocation(openclaw, ["--version"]);
    const result = await execFileAsync(invocation.command, invocation.args, { timeout: 10_000 });
    const output = `${result.stdout}${result.stderr}`.trim();
    const status: CheckStatus = output.includes("Config was last written by a newer OpenClaw") ? "warning" : "ok";
    return { name: "OpenClaw", status, detail: `${openclaw.display}: ${output || "openclaw found"}` };
  } catch (error) {
    return { name: "OpenClaw", status: "missing", detail: `${openclaw.display} is not available: ${(error as Error).message}` };
  }
}

async function openClawWorkerCheck(openclaw: OpenClawCommand, agentId: string): Promise<DoctorCheck> {
  try {
    const agentsInvocation = buildOpenClawInvocation(openclaw, ["agents", "list", "--json"]);
    const agentsResult = await execFileAsync(agentsInvocation.command, agentsInvocation.args, {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024
    });
    const agents = extractJsonArray(agentsResult.stdout);
    const agentExists = agents.some((agent) => (agent as Record<string, unknown>).id === agentId);
    if (!agentExists) {
      return {
        name: `OpenClaw worker (${agentId})`,
        status: "missing",
        detail: `Agent id is not configured for ${openclaw.display}: ${agentId}`
      };
    }

    const modelsInvocation = buildOpenClawInvocation(openclaw, ["models", "status", "--agent", agentId, "--json"]);
    const result = await execFileAsync(modelsInvocation.command, modelsInvocation.args, {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024
    });
    const status = extractJsonObject(result.stdout) as {
      resolvedDefault?: string;
      auth?: {
        missingProvidersInUse?: string[];
        runtimeAuthRoutes?: Array<{ provider?: string; runtime?: string; status?: string }>;
      };
    };
    const missingProviders = status.auth?.missingProvidersInUse ?? [];
    const missingRoutes = (status.auth?.runtimeAuthRoutes ?? []).filter((route) => !["ok", "usable"].includes(route.status ?? ""));
    if (missingProviders.length > 0 || missingRoutes.length > 0) {
      return {
        name: `OpenClaw worker (${agentId})`,
        status: "missing",
        detail: `Model runtime is not ready for ${status.resolvedDefault ?? "unknown model"}. Missing providers: ${
          missingProviders.join(", ") || "none"
        }. Missing routes: ${missingRoutes
          .map((route) => `${route.provider ?? "unknown"}/${route.runtime ?? "unknown"}=${route.status ?? "unknown"}`)
          .join(", ") || "none"}.`
      };
    }
    return {
      name: `OpenClaw worker (${agentId})`,
      status: "ok",
      detail: `${openclaw.display}: model runtime is ready for ${status.resolvedDefault ?? "configured default model"}.`
    };
  } catch (error) {
    const maybeError = error as Error & { stdout?: string; stderr?: string };
    return {
      name: `OpenClaw worker (${agentId})`,
      status: "missing",
      detail: `Unable to verify OpenClaw worker readiness: ${maybeError.stderr || maybeError.stdout || maybeError.message}`
    };
  }
}

async function rasterizerChecks(): Promise<DoctorCheck[]> {
  const soffice = await commandVersionCheck("soffice", ["--version"], "soffice", true);
  const libreoffice = soffice.status === "ok" ? null : await commandVersionCheck("libreoffice", ["--version"], "libreoffice", true);
  const office = soffice.status === "ok" ? soffice : libreoffice!;
  const magick = await commandVersionCheck("magick", ["--version"], "ImageMagick", false);
  const ghostscript = await commandVersionCheck("gs", ["--version"], "Ghostscript", false);
  const rasterizer: DoctorCheck =
    office.status === "ok" && magick.status === "ok" && ghostscript.status === "ok"
      ? {
          name: "PPTX rasterizer",
          status: "ok",
          detail: "LibreOffice, ImageMagick, and Ghostscript are available for PPTX screenshot QA."
        }
      : {
          name: "PPTX rasterizer",
          status: "missing",
          detail:
            "Screenshot QA requires LibreOffice soffice/libreoffice, ImageMagick magick, and Ghostscript gs on PATH."
        };
  return [
    { ...office, name: "LibreOffice" },
    magick,
    ghostscript,
    rasterizer
  ];
}

function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("OpenClaw did not return a JSON object.");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function extractJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error("OpenClaw did not return a JSON array.");
  }
  return JSON.parse(text.slice(start, end + 1)) as unknown[];
}
