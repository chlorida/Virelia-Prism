import type { WhisperModelSize } from '../../../shared/subtitleTypes';
import type {
  FirstRunSetupBenchmarkResult,
  SetupModelCandidate,
} from '../../lib/tauriCommands';
import { listWhisperModels, runFirstRunSetupBenchmark } from '../../lib/tauriCommands';
import type { OnboardingModelId } from './onboardingCopy';

const DEEP_CHECK_TIMEOUT_MS = 12_000;
const MODEL_SIZES: Record<OnboardingModelId, number> = {
  base: 150,
  small: 466,
  medium: 1530,
  'large-v3': 3090,
};

let cached: FirstRunSetupBenchmarkResult | null = null;
let deepInflight: Promise<FirstRunSetupBenchmarkResult | null> | null = null;

function threadCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
  return cores && cores > 0 ? cores : 4;
}

function instantTier(cores: number): 'low' | 'balanced' | 'high' {
  if (cores >= 12) return 'high';
  if (cores >= 6) return 'balanced';
  return 'low';
}

function modelForTier(tier: 'low' | 'balanced' | 'high'): OnboardingModelId {
  if (tier === 'high') return 'medium';
  if (tier === 'balanced') return 'small';
  return 'base';
}

function buildModelCandidates(
  installed: string[],
  recommendedId: OnboardingModelId
): SetupModelCandidate[] {
  const ids: OnboardingModelId[] = ['base', 'small', 'medium', 'large-v3'];
  return ids.map((id) => ({
    id,
    friendlyLabel: id,
    shortLabel: id,
    description: '',
    technicalDetail: '',
    expectedFileName: `ggml-${id}.bin`,
    downloadUrl: '',
    estimatedSizeMb: MODEL_SIZES[id],
    installed: installed.includes(id),
    recommended: id === recommendedId,
  }));
}

export function buildInstantBenchmark(installed: string[] = []): FirstRunSetupBenchmarkResult {
  const cores = threadCount();
  const tier = instantTier(cores);
  const modelId = modelForTier(tier);
  return {
    benchmark: {
      elapsedMs: 1,
      threadCount: cores,
      score: 0,
      tier,
      confidence: 0.55,
      source: 'instant-local',
    },
    resources: {
      ffmpegAvailable: false,
      whisperCliAvailable: false,
      installedModels: installed,
    },
    models: buildModelCandidates(installed, modelId),
    recommendation: {
      modelId,
      friendlyLabel: modelId,
      reason: tier,
      confidence: 0.55,
      installed: installed.includes(modelId),
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('benchmark_timeout')), ms);
    void promise
      .then((value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

export function prefetchOnboardingBenchmark(): FirstRunSetupBenchmarkResult {
  if (!cached) {
    cached = buildInstantBenchmark();
  }
  void enrichInstalledModelsInBackground();
  return cached;
}

async function enrichInstalledModelsInBackground(): Promise<void> {
  try {
    const installed = await withTimeout(listWhisperModels(), 4_000);
    if (!cached) {
      cached = buildInstantBenchmark(installed);
      return;
    }
    const recommendedId = cached.recommendation.modelId as OnboardingModelId;
    cached = {
      ...cached,
      resources: { ...cached.resources, installedModels: installed },
      models: buildModelCandidates(installed, recommendedId),
      recommendation: {
        ...cached.recommendation,
        installed: installed.includes(recommendedId),
      },
    };
  } catch {
    // Keep instant snapshot if model listing is slow.
  }
}

export function getCachedOnboardingBenchmark(): FirstRunSetupBenchmarkResult | null {
  return cached;
}

export function loadOnboardingBenchmark(): Promise<FirstRunSetupBenchmarkResult> {
  return Promise.resolve(prefetchOnboardingBenchmark());
}

export function runDeepOnboardingBenchmark(): Promise<FirstRunSetupBenchmarkResult | null> {
  if (deepInflight) return deepInflight;
  deepInflight = withTimeout(runFirstRunSetupBenchmark(), DEEP_CHECK_TIMEOUT_MS)
    .then((result) => {
      cached = result;
      return result;
    })
    .catch(() => null)
    .finally(() => {
      deepInflight = null;
    });
  return deepInflight;
}

export function fallbackRecommendedModel(): WhisperModelSize {
  return modelForTier(instantTier(threadCount()));
}

export function resetOnboardingBenchmarkCache(): void {
  cached = null;
  deepInflight = null;
}

export function benchmarkTierKey(
  benchmark: FirstRunSetupBenchmarkResult | null
): 'low' | 'balanced' | 'high' {
  if (!benchmark) return instantTier(threadCount());
  const tier = benchmark.benchmark.tier;
  if (tier === 'high' || tier === 'balanced' || tier === 'low') return tier;
  return instantTier(threadCount());
}
