import type {
  CharacterIdentificationResult,
  CharacterIdentifyInput,
  CharacterRecognitionSettings,
} from '../../../shared/characterRecognitionTypes';

export interface CharacterRecognitionProvider {
  id: CharacterRecognitionSettings['mode'];
  isAvailable(settings: CharacterRecognitionSettings): Promise<boolean>;
  identifyFromFrame(
    input: CharacterIdentifyInput,
    settings: CharacterRecognitionSettings
  ): Promise<CharacterIdentificationResult>;
}
