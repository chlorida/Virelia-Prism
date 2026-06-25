const STORAGE_KEY = 'virelia.durationById';

export function loadDurationCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function mergeDurationCache(updates: Record<string, number>): void {
  if (Object.keys(updates).length === 0) return;
  try {
    const current = loadDurationCache();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
  } catch {
    // ignore quota errors
  }
}
