import type { CharacterMetadata } from './titleMetadataTypes';

export type CharacterRecognitionMode = 'disabled' | 'local-http' | 'mock';

export interface CharacterRecognitionSettings {
  mode: CharacterRecognitionMode;
  backendUrl?: string;
}

export interface CharacterIdentificationCandidate {
  characterId: string;
  name: string;
  imageUrl?: string;
  confidence: number;
  reason?: string;
  source: 'vision-backend' | 'manual' | 'subtitle-speaker' | 'mock';
}

export interface CharacterIdentificationResult {
  titleId: string;
  episodeId?: string;
  timestamp?: number;
  candidates: CharacterIdentificationCandidate[];
  createdAt: number;
  provider: CharacterRecognitionMode;
  message?: string;
  isMock?: boolean;
}

export interface CharacterIdentifyInput {
  titleId: string;
  titleName: string;
  episodeId?: string;
  providerIds?: Record<string, string | number | undefined>;
  timestamp?: number;
  frame?: Blob;
  knownCharacters: CharacterMetadata[];
}
