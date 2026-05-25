export class DeckFactoryError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "DeckFactoryError";
    this.exitCode = exitCode;
  }
}

export function fail(message: string, exitCode = 1): never {
  throw new DeckFactoryError(message, exitCode);
}
