const PREFIX = '[Virelia]';

export function startupLog(scope: string, detail?: string): void {
  if (detail) {
    console.info(`${PREFIX} ${scope}: ${detail}`);
  } else {
    console.info(`${PREFIX} ${scope}`);
  }
}

export function startupError(scope: string, error: unknown): void {
  console.error(`${PREFIX} ${scope}`, error);
}
