import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Command } from "commander";

const execFileAsync = promisify(execFile);

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
    .action(async (options: { json?: boolean }) => {
      const checks = await runDoctorChecks();
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

async function runDoctorChecks(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push(await commandVersionCheck("node", ["--version"], "Node.js"));
  checks.push(await commandVersionCheck("npm", ["--version"], "npm"));
  checks.push(await openClawCheck());
  checks.push(await rasterizerCheck());
  return checks;
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

async function openClawCheck(): Promise<DoctorCheck> {
  try {
    const result = await execFileAsync("openclaw", ["--version"], { timeout: 10_000 });
    const output = `${result.stdout}${result.stderr}`.trim();
    const status: CheckStatus = output.includes("Config was last written by a newer OpenClaw") ? "warning" : "ok";
    return { name: "OpenClaw", status, detail: output || "openclaw found" };
  } catch (error) {
    return { name: "OpenClaw", status: "missing", detail: `openclaw is not available: ${(error as Error).message}` };
  }
}

async function rasterizerCheck(): Promise<DoctorCheck> {
  const soffice = await commandVersionCheck("soffice", ["--version"], "soffice", true);
  if (soffice.status === "ok") {
    return { ...soffice, name: "PPTX rasterizer" };
  }
  const libreoffice = await commandVersionCheck("libreoffice", ["--version"], "libreoffice", true);
  if (libreoffice.status === "ok") {
    return { ...libreoffice, name: "PPTX rasterizer" };
  }
  return {
    name: "PPTX rasterizer",
    status: "missing",
    detail: `No PPTX rasterizer found. Tried soffice (${soffice.detail}) and libreoffice (${libreoffice.detail}).`
  };
}
