/** Canonical catalog reference: `provider:providerId` */
export function formatCatalogRef(provider: string, providerId: string): string {
  return `${provider}:${providerId}`;
}

export function parseCatalogRef(ref: string): { provider: string; providerId: string } {
  const colon = ref.indexOf(':');
  if (colon > 0) {
    return { provider: ref.slice(0, colon), providerId: ref.slice(colon + 1) };
  }
  return { provider: 'franchise-catalog', providerId: ref };
}

export function isOnlineCatalogRef(ref: string): boolean {
  const { provider } = parseCatalogRef(ref);
  return provider === 'anilist' || provider === 'tmdb' || provider === 'tvmaze';
}
