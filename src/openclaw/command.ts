export interface OpenClawCommand {
  command: string;
  argsPrefix: string[];
  display: string;
}

export interface OpenClawInvocation {
  command: string;
  args: string[];
}

export interface OpenClawSshTarget {
  host: string;
}

export const DEFAULT_OPENCLAW_COMMAND = "openclaw";
export const DEFAULT_OPENCLAW_AGENT = process.env.DECK_FACTORY_OPENCLAW_AGENT?.trim() || "deck-factory-planner";

export function resolveOpenClawCommand(input?: string): OpenClawCommand {
  const display = input?.trim() || process.env.DECK_FACTORY_OPENCLAW_COMMAND?.trim() || DEFAULT_OPENCLAW_COMMAND;
  const parts = splitCommand(display);
  if (parts.length === 0) {
    throw new Error("OpenClaw command cannot be empty.");
  }
  return {
    command: parts[0],
    argsPrefix: parts.slice(1),
    display
  };
}

export function buildOpenClawArgs(openclaw: OpenClawCommand, args: string[]): string[] {
  return [...openclaw.argsPrefix, ...args];
}

export function buildOpenClawInvocation(openclaw: OpenClawCommand, args: string[]): OpenClawInvocation {
  if (openclaw.command !== "ssh") {
    return { command: openclaw.command, args: buildOpenClawArgs(openclaw, args) };
  }
  const split = splitSshInvocation(openclaw.argsPrefix);
  const remoteParts = split.remoteCommand.length > 0 ? split.remoteCommand : ["openclaw"];
  return {
    command: openclaw.command,
    args: [...split.sshArgs, [...remoteParts, ...args].map(shellQuote).join(" ")]
  };
}

export function resolveSimpleSshTarget(openclaw: OpenClawCommand): OpenClawSshTarget | null {
  if (openclaw.command !== "ssh") {
    return null;
  }
  const split = splitSshInvocation(openclaw.argsPrefix);
  if (split.sshArgs.length !== 1) {
    return null;
  }
  return { host: split.sshArgs[0] };
}

function splitCommand(input: string): string[] {
  const parts: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[3]);
  }
  return parts;
}

function splitSshInvocation(argsPrefix: string[]): { sshArgs: string[]; remoteCommand: string[] } {
  const hostIndex = findSshHostIndex(argsPrefix);
  if (hostIndex < 0) {
    return { sshArgs: argsPrefix, remoteCommand: ["openclaw"] };
  }
  return {
    sshArgs: argsPrefix.slice(0, hostIndex + 1),
    remoteCommand: argsPrefix.slice(hostIndex + 1)
  };
}

function findSshHostIndex(args: string[]): number {
  const optionsWithValue = new Set(["-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"]);
  for (let index = 0; index < args.length; index += 1) {
    const part = args[index];
    if (optionsWithValue.has(part)) {
      index += 1;
      continue;
    }
    if (part.startsWith("-")) {
      continue;
    }
    return index;
  }
  return -1;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
