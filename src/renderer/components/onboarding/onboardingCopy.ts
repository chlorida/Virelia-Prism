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
    metadataEyebrow: 'Titles & posters',
    metadataTitle: 'How should titles appear?',
    metadataBody: 'Affects search, Discover, and artwork labels from online catalogs.',
    metadataHint: 'Change later in Settings → Metadata.',
    metadataAuto: 'Automatic',
    metadataAutoHint: 'Match your interface language',
    metadataEn: 'English titles',
    metadataEnHint: 'Romanized / English names when available',
    metadataRu: 'Russian titles',
    metadataRuHint: 'Russian names when available',
    welcomeEyebrow: 'First launch',
    welcomeTitle: 'Welcome to Prism!',
    welcomeBody:
      'We will set up subtitles and a speech model. Your computer is estimated instantly — no waiting.',
    welcomePrelude: 'Welcome to',
    welcomePrism: 'Prism',
    benchmarkRunning: 'Estimating…',
    benchmarkReady: 'Ready',
    benchmarkManual: 'Manual pick',
    pickingModel: 'Choosing a model',
    basicsEyebrow: 'Essentials',
    basicsTitle: 'Core settings',
    basicsBody:
      'We will set up subtitles and a speech model. Add your media library on the last step, or anytime from the sidebar.',
    smartSubtitles: 'Smart subtitles',
    smartSubtitlesHint: 'If no subtitles exist, Prism can create them locally.',
    autoRecommend: 'Suggest a speech model for my PC',
    autoRecommendHint: 'Uses a quick estimate. You can change the model on the next steps.',
    uiSounds: 'Interface sounds',
    uiSoundsHint: 'Short clicks when navigating. You can turn this off anytime.',
    catalogEyebrow: 'Catalog & search',
    catalogTitle: 'Adult content in the catalog',
    catalogBody:
      'Prism can search online catalogs (anime, series, movies). Some entries are marked 18+. Choose what appears in search, Discover, and recommendations.',
    catalogHint: 'You can change this anytime in Settings → Discovery.',
    catalogChoiceHidden: 'Hide 18+ content',
    catalogChoiceHiddenHint:
      'Recommended. Adult titles never appear in search or recommendations.',
    catalogChoiceShow: 'Show 18+ content',
    catalogChoiceShowHint:
      'Adult catalog entries appear everywhere. You must be of legal age in your region.',
    onlineEyebrow: 'Online catalogs',
    onlineTitle: 'Search beyond your files?',
    onlineBody:
      'Prism can look up anime, series, and movies online for Discover, search, and cover art. Your file paths are never uploaded.',
    onlineHint: 'Change later in Settings → Metadata.',
    onlineChoiceCatalog: 'Search online catalogs',
    onlineChoiceCatalogHint:
      'Discover, catalog search, posters, and descriptions from the internet.',
    onlineChoiceLocal: 'Local library only',
    onlineChoiceLocalHint:
      'No online search or Discover rails. More private; add metadata yourself.',
    importEyebrow: 'Your library',
    importTitle: 'Add your media',
    importBody:
      'Pick a folder with videos or music. Prism scans it locally and powers recommendations from what you watch.',
    importHint: 'You can add more folders anytime from the sidebar.',
    importChooseFolder: 'Choose folder',
    importSkipForNow: 'Skip for now',
    importAlreadyAdded: 'A library folder is already configured. You can add more later.',
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
    metadataEyebrow: 'Названия и постеры',
    metadataTitle: 'Как показывать названия?',
    metadataBody: 'Влияет на поиск, Discover и подписи к обложкам из онлайн-каталогов.',
    metadataHint: 'Позже можно изменить в Настройки → Метаданные.',
    metadataAuto: 'Автоматически',
    metadataAutoHint: 'Как язык интерфейса',
    metadataEn: 'Английские названия',
    metadataEnHint: 'Романизация / English, если доступно',
    metadataRu: 'Русские названия',
    metadataRuHint: 'Русские имена, если доступно',
    welcomeEyebrow: 'Первый запуск',
    welcomeTitle: 'Добро пожаловать в Prism!',
    welcomeBody:
      'Настроим субтитры и модель речи. Компьютер оценивается мгновенно — ждать не нужно.',
    welcomePrelude: 'Добро пожаловать в',
    welcomePrism: 'Prism',
    benchmarkRunning: 'Оцениваем…',
    benchmarkReady: 'Готово',
    benchmarkManual: 'Выбор вручную',
    pickingModel: 'Подбираем модель',
    basicsEyebrow: 'Основное',
    basicsTitle: 'Базовые настройки',
    basicsBody:
      'Настроим субтитры и распознавание речи. Медиатеку можно добавить на последнем шаге или в любой момент из бокового меню.',
    smartSubtitles: 'Умные субтитры',
    smartSubtitlesHint: 'Если субтитров нет, Prism создаст их локально.',
    autoRecommend: 'Подобрать модель речи под мой ПК',
    autoRecommendHint: 'Быстрая оценка. Модель можно сменить на следующих шагах.',
    uiSounds: 'Звуки интерфейса',
    uiSoundsHint: 'Короткие клики при навигации. Можно выключить в любой момент.',
    catalogEyebrow: 'Каталог и поиск',
    catalogTitle: 'Контент 18+ в каталоге',
    catalogBody:
      'Prism ищет по онлайн-каталогам (аниме, сериалы, фильмы). Часть записей помечена как 18+. Выберите, что показывать в поиске, Discover и рекомендациях.',
    catalogHint: 'Это можно изменить в любой момент в Настройки → Метаданные.',
    catalogChoiceHidden: 'Скрывать контент 18+',
    catalogChoiceHiddenHint:
      'Рекомендуется. Взрослые тайтлы не появятся в поиске и рекомендациях.',
    catalogChoiceShow: 'Показывать контент 18+',
    catalogChoiceShowHint:
      'Взрослые записи видны везде. Вы должны быть совершеннолетним в своём регионе.',
    onlineEyebrow: 'Онлайн-каталоги',
    onlineTitle: 'Искать за пределами файлов?',
    onlineBody:
      'Prism может искать аниме, сериалы и фильмы в интернете для Discover, поиска и обложек. Пути к файлам не отправляются.',
    onlineHint: 'Позже можно изменить в Настройки → Метаданные.',
    onlineChoiceCatalog: 'Искать в онлайн-каталогах',
    onlineChoiceCatalogHint:
      'Discover, поиск по каталогу, постеры и описания из интернета.',
    onlineChoiceLocal: 'Только локальная библиотека',
    onlineChoiceLocalHint:
      'Без онлайн-поиска и полок Discover. Приватнее; метаданные добавляете сами.',
    importEyebrow: 'Ваша библиотека',
    importTitle: 'Добавьте медиа',
    importBody:
      'Выберите папку с видео или музыкой. Prism сканирует её локально и строит рекомендации по тому, что вы смотрите.',
    importHint: 'Другие папки можно добавить в любой момент из бокового меню.',
    importChooseFolder: 'Выбрать папку',
    importSkipForNow: 'Пропустить',
    importAlreadyAdded: 'Папка библиотеки уже добавлена. Можно добавить ещё позже.',
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
