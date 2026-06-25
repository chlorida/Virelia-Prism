import type {
  CharacterIdentificationResult,
  CharacterIdentifyInput,
  CharacterRecognitionSettings,
} from '../../../../shared/characterRecognitionTypes';
import type { CharacterRecognitionProvider } from '../types';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export const localHttpCharacterProvider: CharacterRecognitionProvider = {
  id: 'local-http',
  async isAvailable(settings: CharacterRecognitionSettings) {
    return settings.mode === 'local-http' && Boolean(settings.backendUrl?.trim());
  },
  async identifyFromFrame(
    input: CharacterIdentifyInput,
    settings: CharacterRecognitionSettings
  ): Promise<CharacterIdentificationResult> {
    const base = settings.backendUrl?.trim();
    if (!base) {
      return {
        titleId: input.titleId,
        timestamp: input.timestamp,
        candidates: [],
        createdAt: Date.now(),
        provider: 'disabled',
        message: 'characterRecognition.noBackendUrl',
      };
    }

    const endpoint = `${normalizeBaseUrl(base)}/identify-characters`;
    const form = new FormData();
    form.append('title', input.titleName);
    form.append('titleId', input.titleId);
    if (input.timestamp != null) form.append('timestamp', String(input.timestamp));
    if (input.providerIds) form.append('providerIds', JSON.stringify(input.providerIds));
    form.append('knownCharacters', JSON.stringify(input.knownCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      nativeName: c.nativeName,
      aliases: c.aliases,
      role: c.role,
      imageUrl: c.image?.displayUrl ?? c.image?.url,
    }))));
    if (input.frame) form.append('frame', input.frame, 'frame.jpg');

    try {
      const response = await fetch(endpoint, { method: 'POST', body: form });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json() as {
        candidates?: Array<{
          characterId?: string;
          name?: string;
          imageUrl?: string;
          confidence?: number;
          reason?: string;
        }>;
      };

      return {
        titleId: input.titleId,
        timestamp: input.timestamp,
        createdAt: Date.now(),
        provider: 'local-http',
        candidates: (json.candidates ?? []).map((c) => ({
          characterId: c.characterId ?? c.name ?? 'unknown',
          name: c.name ?? 'Unknown',
          imageUrl: c.imageUrl,
          confidence: c.confidence ?? 0,
          reason: c.reason,
          source: 'vision-backend' as const,
        })),
      };
    } catch {
      return {
        titleId: input.titleId,
        timestamp: input.timestamp,
        candidates: [],
        createdAt: Date.now(),
        provider: 'local-http',
        message: 'characterRecognition.backendFailed',
      };
    }
  },
};
