/**
 * Shared media file classification — mirrors Rust `media_file_filter.rs`.
 * Applied before items enter library store, recommendations, or playback.
 */

export type MediaSkipReason =
  | 'source-code-file'
  | 'dev-folder'
  | 'short-sfx'
  | 'test-fixture'
  | 'unsupported-extension'
  | 'ambiguous-extension'
  | 'duration-too-short'
  | 'personal-media';

export interface ExtensionInfo {
  compoundExtension: string;
  simpleExtension: string;
}

const ALWAYS_IGNORED_EXTENSIONS = [
  '.d.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.map',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.xml',
  '.yml',
  '.yaml',
  '.toml',
  '.rs',
  '.cpp',
  '.c',
  '.h',
  '.hpp',
  '.cs',
  '.py',
  '.lua',
  '.java',
  '.kt',
  '.swift',
  '.go',
  '.php',
  '.rb',
  '.md',
  '.txt',
  '.log',
  '.ini',
  '.cfg',
] as const;

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.m2ts', '.flv', '.wmv']);

const SUSPICIOUS_PATH_SEGMENTS = [
  'audiofilters',
  'audiofilter',
  'dvaaudiofilters',
  'sfx',
  'sounds',
  'sound',
  '\\wav\\',
  '/wav/',
  'assets',
  'samples',
  'engine',
  'game',
  'types',
  'mzscripting',
  'mediacorebackend',
  'algebra',
  'graphics',
  'node_modules',
  '\\src\\',
  '/src/',
  '\\dist\\',
  '/dist/',
  '\\build\\',
  '/build/',
  '\\target\\',
  '/target/',
  'vendor',
  'third_party',
  'third-party',
  '\\tests\\',
  '/tests/',
  '\\testdata\\',
  '/testdata/',
  '\\test-data\\',
  '/test-data/',
  '\\fixtures\\',
  '/fixtures/',
  '\\__tests__\\',
  '/__tests__/',
];

const TEST_PATH_SEGMENTS = new Set([
  'tests',
  'testdata',
  'test-data',
  'fixtures',
  '__tests__',
  'spec',
  'specs',
  'mocks',
]);

export function isTestOrFixturePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.some((seg) => TEST_PATH_SEGMENTS.has(seg.toLowerCase()));
}

export function isLikelyTestFixtureFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.startsWith('test-')) return false;
  return (
    lower.includes('hz')
    || lower.includes('-ch-')
    || lower.includes('rf64')
    || lower.includes('eof')
    || lower.includes('chunk')
  );
}

export function getExtensionInfo(fileName: string): ExtensionInfo {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.d.ts')) {
    return { compoundExtension: '.d.ts', simpleExtension: 'd.ts' };
  }
  for (const ext of ALWAYS_IGNORED_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return { compoundExtension: ext, simpleExtension: ext.slice(1) };
    }
  }
  const dot = lower.lastIndexOf('.');
  const compound = dot >= 0 ? lower.slice(dot) : '';
  return { compoundExtension: compound, simpleExtension: compound.slice(1) };
}

export function isAlwaysIgnoredFile(fileName: string, extensionInfo?: ExtensionInfo): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.d.ts')) return true;
  const info = extensionInfo ?? getExtensionInfo(fileName);
  if (info.compoundExtension === '.ts' || info.compoundExtension === '.dts') return false;
  return (ALWAYS_IGNORED_EXTENSIONS as readonly string[]).includes(info.compoundExtension);
}

export function isSuspiciousAssetPath(filePath: string): boolean {
  const lower = filePath.replace(/\//g, '\\').toLowerCase();
  return SUSPICIOUS_PATH_SEGMENTS.some((seg) => lower.includes(seg));
}

export function detectMediaKindFromExtension(extensionInfo: ExtensionInfo): 'audio' | 'video' | undefined {
  if (isAlwaysIgnoredFile('', extensionInfo)) return undefined;
  const ext = extensionInfo.compoundExtension;
  if (ext === '.ts' || ext === '.dts') return undefined;
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return undefined;
}

export function isLikelyShortSfx(filePath: string, fileName: string): boolean {
  const info = getExtensionInfo(fileName);
  if (info.compoundExtension !== '.wav') return false;
  if (!isSuspiciousAssetPath(filePath)) return false;
  return true;
}

/** Screen recordings, OBS clips, YouTube counters, and other non-library personal media. */
export function isLikelyPersonalOrJunkMedia(filePath: string, fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  const lowerPath = filePath.replace(/\//g, '\\').toLowerCase();

  if (lowerName.startsWith('__')) return true;
  if (/^\(\d+\)/.test(fileName.trim())) return true;
  if (/^\d{4}-\d{2}-\d{2}(\s+\d{2}[-:]\d{2}(-\d{2})?)?\.[a-z0-9]+$/i.test(fileName)) return true;
  if (/^\d{4}-\d{2}-\d{2}(\s+\d{2}[-:]\d{2}(-\d{2})?)?$/i.test(fileName.replace(/\.[^.]+$/, ''))) {
    return true;
  }

  const pathMarkers = [
    '\\captures\\',
    '\\screen recordings\\',
    '\\screen record\\',
    '\\obs\\',
    '\\nvidia\\',
    '\\shadowplay\\',
    '\\sharex\\',
  ];
  if (pathMarkers.some((marker) => lowerPath.includes(marker))) return true;

  const nameMarkers = [
    'screen record',
    'screenrecord',
    'obs studio',
    'bandicam',
    'sharex',
    'shadowplay',
    'nvidia share',
    'gameplay',
    'generate resources',
    'generate resource',
  ];
  if (nameMarkers.some((marker) => lowerName.includes(marker))) return true;

  if (/\d{4}-\d{2}-\d{2}/.test(fileName)) return true;
  if (/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(fileName)) return true;
  if (/\b(фон|обои|заставка|wallpaper|background|screensaver)\b/i.test(fileName)) return true;

  return false;
}

export interface MediaCandidateResult {
  isMediaCandidate: boolean;
  skipReason: MediaSkipReason | null;
  kind: 'audio' | 'video' | null;
  compoundExtension: string;
}

export function classifyMediaFile(filePath: string, fileName: string): MediaCandidateResult {
  const extensionInfo = getExtensionInfo(fileName);
  const compoundExtension = extensionInfo.compoundExtension;

  if (isAlwaysIgnoredFile(fileName, extensionInfo)) {
    return {
      isMediaCandidate: false,
      skipReason: 'source-code-file',
      kind: null,
      compoundExtension,
    };
  }

  if (isTestOrFixturePath(filePath) || isLikelyTestFixtureFile(fileName)) {
    return {
      isMediaCandidate: false,
      skipReason: 'test-fixture',
      kind: null,
      compoundExtension,
    };
  }

  if (isSuspiciousAssetPath(filePath) && !detectMediaKindFromExtension(extensionInfo)) {
    return {
      isMediaCandidate: false,
      skipReason: 'dev-folder',
      kind: null,
      compoundExtension,
    };
  }

  if (compoundExtension === '.ts' || compoundExtension === '.dts') {
    return {
      isMediaCandidate: false,
      skipReason: 'ambiguous-extension',
      kind: null,
      compoundExtension,
    };
  }

  const kind = detectMediaKindFromExtension(extensionInfo);
  if (!kind) {
    return {
      isMediaCandidate: false,
      skipReason: 'unsupported-extension',
      kind: null,
      compoundExtension,
    };
  }

  if (isLikelyShortSfx(filePath, fileName)) {
    return {
      isMediaCandidate: false,
      skipReason: 'short-sfx',
      kind: null,
      compoundExtension,
    };
  }

  if (isLikelyPersonalOrJunkMedia(filePath, fileName)) {
    return {
      isMediaCandidate: false,
      skipReason: 'personal-media',
      kind: null,
      compoundExtension,
    };
  }

  return {
    isMediaCandidate: true,
    skipReason: null,
    kind,
    compoundExtension,
  };
}

export function shouldIncludeInLibrary(filePath: string, fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  if (lowerName.endsWith('.d.ts') || lowerPath.endsWith('.d.ts')) return false;
  return classifyMediaFile(filePath, fileName).isMediaCandidate;
}
