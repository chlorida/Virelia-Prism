import type { TitleMediaAsset } from '../../../../shared/titleMetadataTypes';

/**
 * Future hook for user-captured frames stored per title.
 * Not wired to mandatory generation — safe no-op for now.
 */
export async function listLocalTitleFrames(_titleId: string): Promise<TitleMediaAsset[]> {
  return [];
}

export async function saveLocalTitleFrame(
  _titleId: string,
  _blob: Blob,
  _timestamp?: number
): Promise<TitleMediaAsset | null> {
  return null;
}
