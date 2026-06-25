import type {
  CharacterIdentificationResult,
  CharacterIdentifyInput,
  CharacterRecognitionSettings,
} from '../../../../shared/characterRecognitionTypes';
import type { CharacterRecognitionProvider } from '../types';

export const mockCharacterProvider: CharacterRecognitionProvider = {
  id: 'mock',
  async isAvailable(settings: CharacterRecognitionSettings) {
    return settings.mode === 'mock';
  },
  async identifyFromFrame(input: CharacterIdentifyInput, _settings: CharacterRecognitionSettings): Promise<CharacterIdentificationResult> {
    const first = input.knownCharacters[0];
    return {
      titleId: input.titleId,
      timestamp: input.timestamp,
      createdAt: Date.now(),
      provider: 'mock',
      isMock: true,
      message: 'characterRecognition.mockWarning',
      candidates: first
        ? [{
            characterId: first.id,
            name: first.name,
            imageUrl: first.image?.displayUrl ?? first.image?.url,
            confidence: 0.42,
            reason: 'Mock provider — not real vision',
            source: 'mock',
          }]
        : [],
    };
  },
};
