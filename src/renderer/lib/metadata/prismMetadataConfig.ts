/** Default Prism Metadata Gateway base URL (no secrets in frontend). */
export const DEFAULT_PRISM_METADATA_GATEWAY_URL =
  import.meta.env.VITE_PRISM_METADATA_GATEWAY_URL ?? 'https://metadata.prism.virelia.app/v1';

export function isDevMockCatalogEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_PRISM_DEV_MOCK_CATALOG === '1';
}

export function getGatewayBaseUrl(override?: string): string {
  const trimmed = override?.trim();
  return trimmed || DEFAULT_PRISM_METADATA_GATEWAY_URL;
}
