export interface CommandInvocation {
  command: string;
  args: string[];
  display: string;
}

export function buildCommandInvocation(commandSpec: string, args: string[]): CommandInvocation {
  const parts = splitCommand(commandSpec);
  if (parts.length === 0) {
    throw new Error("Command cannot be empty.");
  }
  return {
    command: parts[0],
    args: [...parts.slice(1), ...args],
    display: commandSpec
  };
}

export function splitCommand(input: string): string[] {
  const parts: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[3]);
  }
  return parts;
}
