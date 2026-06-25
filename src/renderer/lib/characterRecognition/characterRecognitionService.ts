import type {
  CharacterIdentificationResult,
  CharacterIdentifyInput,
  CharacterRecognitionMode,
  CharacterRecognitionSettings,
} from '../../../shared/characterRecognitionTypes';
import { disabledCharacterProvider } from './providers/disabledProvider';
import { localHttpCharacterProvider } from './providers/localHttpProvider';
import { mockCharacterProvider } from './providers/mockProvider';
import type { CharacterRecognitionProvider } from './types';

let settings: CharacterRecognitionSettings = { mode: 'disabled', backendUrl: '' };

export function configureCharacterRecognition(next: CharacterRecognitionSettings): void {
  settings = {
    mode: next.mode ?? 'disabled',
    backendUrl: next.backendUrl?.trim() ?? '',
  };
}

function providerForMode(mode: CharacterRecognitionMode): CharacterRecognitionProvider {
  if (mode === 'local-http') return localHttpCharacterProvider;
  if (mode === 'mock') return mockCharacterProvider;
  return disabledCharacterProvider;
}

export function getCharacterRecognitionMode(): CharacterRecognitionMode {
  return settings.mode ?? 'disabled';
}

export async function identifyCharacters(
  input: CharacterIdentifyInput
): Promise<CharacterIdentificationResult> {
  const provider = providerForMode(settings.mode ?? 'disabled');
  const available = await provider.isAvailable(settings);
  if (!available) {
    return disabledCharacterProvider.identifyFromFrame(input, settings);
  }
  return provider.identifyFromFrame(input, settings);
}
