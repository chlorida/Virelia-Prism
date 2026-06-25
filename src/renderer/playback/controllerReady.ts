import type { MediaController } from './mediaController';

export async function waitForMediaController(
  getController: () => MediaController | null,
  timeoutMs = 8000
): Promise<MediaController | null> {
  const deadline = Date.now() + timeoutMs;
  while (!getController() && Date.now() < deadline) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  return getController();
}
