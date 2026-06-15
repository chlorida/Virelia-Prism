import type { UiLanguagePreference } from '../../../shared/types';
import type { WhisperModelSize } from '../../../shared/subtitleTypes';

/** Supported onboarding locales. Add `'tok'` here when Toki Pona copy is ready. */
export type OnboardingLang = 'en' | 'ru';

export const ONBOARDING_LANGS: readonly OnboardingLang[] = ['en', 'ru'];

export type OnboardingModelId = Extract<WhisperModelSize, 'base' | 'small' | 'medium' | 'large-v3'>;
export type BenchmarkTier = 'low' | 'balanced' | 'high';

export function resolveOnboardingLang(pref: UiLanguagePreference): OnboardingLang {
  if (pref === 'ru' || pref === 'en') return pref;
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  return nav.startsWith('ru') ? 'ru' : 'en';
}

const COPY = {
  en: {
    brand: 'Virelia Prism',
    stepsAria: 'Setup progress',
    back: 'Back',
    skip: 'Skip',
    next: 'Continue',
    start: 'Get started',
    save: 'Save',
    downloadContinue: 'Download and continue',
    continueBtn: 'Continue',
    retryDownload: 'Try again',
    cancelDownload: 'Cancel',
    languageEyebrow: 'Language',
    languageTitle: 'Choose your language',
    languageHint: 'You can change this later in Settings.',
    languageAuto: 'Automatic',
    languageAutoHint: 'Follow system language',
    languageEn: 'English',
    languageEnHint: 'English interface',
    languageRu: 'Russian',
    languageRuHint: 'Russian interface',
    welcomeEyebrow: 'First launch',
    welcomeTitle: 'Welcome to Prism!',
    welcomeBody:
      'We will set up subtitles and a speech model. Your computer is estimated instantly — no waiting.',
    benchmarkRunning: 'Estimating…',
    benchmarkReady: 'Ready',
    benchmarkManual: 'Manual pick',
    pickingModel: 'Choosing a model',
    basicsEyebrow: 'Essentials',
    basicsTitle: 'Core settings',
    basicsBody:
      'Keep the interface calm. Add your media library later; subtitles can start right away.',
    smartSubtitles: 'Smart subtitles',
    smartSubtitlesHint: 'If no subtitles exist, Prism can create them locally.',
    autoRecommend: 'Suggest a speech model for my PC',
    autoRecommendHint: 'Uses a quick estimate. You can change the model on the next steps.',
    adultContentTitle: 'Adult content (18+)',
    adultContentBody:
      'Some catalog titles are marked 18+. When this is off, they never appear in search, Discover, or recommendations.',
    adultContentHint: 'You can change this anytime in Settings → Discovery.',
    adultContentToggle: 'Show adult content in catalog',
    testEyebrow: 'Quick estimate',
    testTitle: 'Your computer at a glance',
    testRunning: 'Estimating from CPU threads — usually under a second.',
    testInstantDone: 'Quick estimate complete. You can continue or run a deeper check.',
    testFailed: 'Estimate unavailable. Pick a model manually on the next step.',
    testSkip: 'Skip and pick a model myself',
    testManualBody: 'Automatic recommendations are off. Choose a model on the next step.',
    runDeepCheck: 'Run deeper check',
    deepCheckRunning: 'Running a deeper hardware check…',
    deepCheckDone: 'Deeper check complete.',
    deepCheckFailed: 'Deeper check timed out. The quick estimate is still used.',
    threads: (n: number) => `${n} threads`,
    recommendationReason: (tier: BenchmarkTier, modelName: string) => {
      if (tier === 'high') {
        return `We recommend ${modelName}: your PC should handle higher-quality recognition without long waits.`;
      }
      if (tier === 'balanced') {
        return `We recommend ${modelName}: a good balance of speed and accuracy for most PCs.`;
      }
      return `We recommend ${modelName}: faster and gentler on weaker hardware.`;
    },
    modelEyebrow: 'Speech model',
    modelTitle: 'Choose recognition quality',
    modelHint: 'Simple names only. Technical details appear when you hover a card.',
    recommended: 'Recommended',
    installed: 'Already installed',
    modelReady: 'Model ready',
    downloading: (pct: number) => `Downloading ${pct}%`,
    downloadStopped: 'Download stopped',
    downloadPreparing: 'Preparing download…',
    recommendedOverride: (name: string) =>
      `Prism recommended ${name}. You can change this later.`,
    finishEyebrow: 'All set',
    finishTitle: 'Prism is ready',
    finishBody: (name: string) =>
      `Model “${name}” is selected. Add your library and start watching.`,
    models: {
      base: {
        label: 'Light',
        description: 'Fast start, gentle on weaker PCs.',
        detail: 'ggml-base.bin, ~150 MB. Fastest, but less accurate on hard dialogue.',
      },
      small: {
        label: 'Balanced',
        description: 'Best speed and accuracy balance for most PCs.',
        detail: 'ggml-small.bin, ~466 MB. Noticeably better than Light, still quick.',
      },
      medium: {
        label: 'Accurate',
        description: 'Better for Japanese speech, names, and fast dialogue.',
        detail: 'ggml-medium.bin, ~1.5 GB. Slower, but much more accurate for anime.',
      },
      'large-v3': {
        label: 'Maximum',
        description: 'Best accuracy if you can wait.',
        detail: 'ggml-large-v3.bin, ~3 GB. Heaviest and slowest, highest quality.',
      },
    },
  },
  ru: {
    brand: 'Virelia Prism',
    stepsAria: 'Прогресс настройки',
    back: 'Назад',
    skip: 'Пропустить',
    next: 'Дальше',
    start: 'Начать',
    save: 'Сохранить',
    downloadContinue: 'Скачать и продолжить',
    continueBtn: 'Продолжить',
    retryDownload: 'Попробовать снова',
    cancelDownload: 'Отменить',
    languageEyebrow: 'Язык',
    languageTitle: 'Выберите язык',
    languageHint: 'Позже можно изменить в настройках.',
    languageAuto: 'Автоматически',
    languageAutoHint: 'Как в системе',
    languageEn: 'English',
    languageEnHint: 'Интерфейс на английском',
    languageRu: 'Русский',
    languageRuHint: 'Интерфейс на русском',
    welcomeEyebrow: 'Первый запуск',
    welcomeTitle: 'Добро пожаловать в Prism!',
    welcomeBody:
      'Настроим субтитры и модель речи. Компьютер оценивается мгновенно — ждать не нужно.',
    benchmarkRunning: 'Оцениваем…',
    benchmarkReady: 'Готово',
    benchmarkManual: 'Выбор вручную',
    pickingModel: 'Подбираем модель',
    basicsEyebrow: 'Основное',
    basicsTitle: 'Базовые настройки',
    basicsBody:
      'Интерфейс останется спокойным. Медиатеку можно добавить позже, субтитры — включить сразу.',
    smartSubtitles: 'Умные субтитры',
    smartSubtitlesHint: 'Если субтитров нет, Prism создаст их локально.',
    autoRecommend: 'Подобрать модель речи под мой ПК',
    autoRecommendHint: 'Быстрая оценка. Модель можно сменить на следующих шагах.',
    adultContentTitle: 'Контент 18+',
    adultContentBody:
      'Часть названий в каталоге помечена как 18+. Если выключено, они не появятся в поиске, Discover и рекомендациях.',
    adultContentHint: 'Это можно изменить в любой момент в Настройки → Метаданные.',
    adultContentToggle: 'Показывать контент 18+ в каталоге',
    testEyebrow: 'Быстрая оценка',
    testTitle: 'Ваш компьютер',
    testRunning: 'Считаем по числу потоков CPU — обычно меньше секунды.',
    testInstantDone: 'Быстрая оценка готова. Можно продолжить или уточнить проверку.',
    testFailed: 'Оценка недоступна. Модель можно выбрать вручную на следующем шаге.',
    testSkip: 'Пропустить и выбрать модель самому',
    testManualBody: 'Автоподбор выключен. Модель можно выбрать на следующем шаге.',
    runDeepCheck: 'Уточнить проверку',
    deepCheckRunning: 'Запускаем углублённую проверку…',
    deepCheckDone: 'Углублённая проверка завершена.',
    deepCheckFailed: 'Углублённая проверка не успела завершиться. Используем быструю оценку.',
    threads: (n: number) => `${n} потоков`,
    recommendationReason: (tier: BenchmarkTier, modelName: string) => {
      if (tier === 'high') {
        return `Рекомендуем «${modelName}»: компьютер должен потянуть более качественное распознавание без лишнего ожидания.`;
      }
      if (tier === 'balanced') {
        return `Рекомендуем «${modelName}»: хороший баланс скорости и точности для большинства ПК.`;
      }
      return `Рекомендуем «${modelName}»: быстрее и бережнее к слабому компьютеру.`;
    },
    modelEyebrow: 'Модель речи',
    modelTitle: 'Выберите качество распознавания',
    modelHint: 'Без сложных названий. Технические детали — при наведении на карточку.',
    recommended: 'Рекомендуем',
    installed: 'Уже установлена',
    modelReady: 'Модель готова',
    downloading: (pct: number) => `Скачиваем ${pct}%`,
    downloadStopped: 'Загрузка остановлена',
    downloadPreparing: 'Подготовка загрузки…',
    recommendedOverride: (name: string) =>
      `Prism рекомендовал «${name}». Выбор можно изменить позже.`,
    finishEyebrow: 'Готово',
    finishTitle: 'Prism готов',
    finishBody: (name: string) =>
      `Модель «${name}» выбрана. Добавьте медиатеку и смотрите.`,
    models: {
      base: {
        label: 'Лёгкая',
        description: 'Быстро запускается и подходит слабым компьютерам.',
        detail: 'ggml-base.bin, ~150 MB. Самая быстрая, но чаще ошибается в сложной речи.',
      },
      small: {
        label: 'Сбалансированная',
        description: 'Лучший баланс скорости и точности для большинства ПК.',
        detail: 'ggml-small.bin, ~466 MB. Заметно точнее лёгкой и всё ещё быстрая.',
      },
      medium: {
        label: 'Точная',
        description: 'Лучше для японской речи, имён и быстрых диалогов.',
        detail: 'ggml-medium.bin, ~1.5 GB. Медленнее, но заметно точнее для аниме.',
      },
      'large-v3': {
        label: 'Максимальная',
        description: 'Максимальная точность, если компьютер готов подождать.',
        detail: 'ggml-large-v3.bin, ~3 GB. Самая тяжёлая и медленная модель.',
      },
    },
  },
} as const satisfies Record<OnboardingLang, Record<string, unknown>>;

export type OnboardingCopy = (typeof COPY)[OnboardingLang];
export type OnboardingModelCopy = OnboardingCopy['models'][OnboardingModelId];

export function getOnboardingCopy(lang: OnboardingLang): OnboardingCopy {
  return COPY[lang];
}

export function getOnboardingModelCopy(
  copy: OnboardingCopy,
  modelId: WhisperModelSize
): OnboardingModelCopy {
  if (modelId in copy.models) {
    return copy.models[modelId as OnboardingModelId];
  }
  return copy.models.base;
}

export function getRecommendationCopy(
  copy: OnboardingCopy,
  tier: BenchmarkTier,
  modelId: WhisperModelSize
): string {
  const modelName = getOnboardingModelCopy(copy, modelId).label;
  return copy.recommendationReason(tier, modelName);
}
