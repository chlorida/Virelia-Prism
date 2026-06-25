import type {
  CharacterIdentificationResult,
  CharacterIdentifyInput,
  CharacterRecognitionSettings,
} from '../../../../shared/characterRecognitionTypes';
import type { CharacterRecognitionProvider } from '../types';

export const disabledCharacterProvider: CharacterRecognitionProvider = {
  id: 'disabled',
  async isAvailable() {
    return true;
  },
  async identifyFromFrame(input: CharacterIdentifyInput, _settings: CharacterRecognitionSettings): Promise<CharacterIdentificationResult> {
    return {
      titleId: input.titleId,
      episodeId: input.episodeId,
      timestamp: input.timestamp,
      candidates: [],
      createdAt: Date.now(),
      provider: 'disabled',
      message: 'characterRecognition.disabled',
    };
  },
};
