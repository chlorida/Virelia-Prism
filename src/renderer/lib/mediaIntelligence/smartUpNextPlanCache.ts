import type { SmartUpNextPlan } from './types';

export const SMART_UP_NEXT_ENGINE_VERSION = 4;

export interface SmartUpNextMemoKey {
  currentItemId: string;
  currentItemPath: string;
  mediaIndexVersion: string;
  language: string;
  historyVersion: string;
  queueVersion: string;
  engineVersion: number;
}

const planCache = new Map<string, SmartUpNextPlan>();
const MAX_ENTRIES = 64;

function serializeKey(key: SmartUpNextMemoKey): string {
  return JSON.stringify(key);
}

export function getCachedSmartUpNextPlan(
  key: SmartUpNextMemoKey,
  compute: () => SmartUpNextPlan
): SmartUpNextPlan {
  const serialized = serializeKey(key);
  const hit = planCache.get(serialized);
  if (hit) return hit;
  const plan = compute();
  planCache.set(serialized, plan);
  if (planCache.size > MAX_ENTRIES) {
    const oldest = planCache.keys().next().value;
    if (oldest) planCache.delete(oldest);
  }
  return plan;
}

export function invalidateSmartUpNextPlanCache(): void {
  planCache.clear();
}
