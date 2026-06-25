import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
};

export function IconPlay(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <polygon points="8,5 19,12 8,19" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <rect x="7" y="5" width="4" height="14" fill="currentColor" stroke="none" />
      <rect x="13" y="5" width="4" height="14" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSkipBack(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <polygon points="19,20 9,12 19,4" fill="currentColor" stroke="none" />
      <line x1="5" y1="5" x2="5" y2="19" />
    </svg>
  );
}

export function IconSkipForward(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <polygon points="5,4 15,12 5,20" fill="currentColor" stroke="none" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

export function IconShuffle(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

export function IconRepeat(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function IconRepeatOne(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      <text x="12" y="15" fill="currentColor" stroke="none" fontSize="8" fontWeight="700" textAnchor="middle">1</text>
    </svg>
  );
}

export function IconVolume(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a8 8 0 0 1 0 12" />
    </svg>
  );
}

export function IconVolumeMuted(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}

export function IconMaximize(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconMinimize(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <path d="M14 14l7 7" />
      <path d="M3 3l7 7" />
    </svg>
  );
}

/** Wide-screen / theater mode (not brightness). */
export function IconTheater(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

export function IconTheaterExit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="18" height="10" rx="1" />
      <path d="M3 11h18M8 7V5h8v2" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.47.57 1.04.6 1.63V11a2 2 0 0 1 0 4h-.09c-.03.59-.24 1.16-.6 1.63z" />
    </svg>
  );
}

export function IconCaptions(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M6.5 12h3.2a1.8 1.8 0 0 0 0-3.6H6.5V12zm0 4h4.2a2.2 2.2 0 0 0 0-4.4H6.5V16zm7.8-4h3.2a1.8 1.8 0 0 0 0-3.6h-3.2V12zm0 4h4.2a2.2 2.2 0 0 0 0-4.4h-3.2V16z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Character on-screen identification */
export function IconCharacterScan(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="9" r="3.25" />
      <path d="M5.5 19.5c.9-2.8 3-4.5 6.5-4.5s5.6 1.7 6.5 4.5" />
      <path d="M18 5.5l2-2M18 5.5l-1.5 1.5M18 5.5l1.5 1.5" />
      <rect x="15.5" y="2.5" width="5" height="5" rx="1" strokeDasharray="2 1.5" />
    </svg>
  );
}

export function IconSparkGenerate(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3z" fill="currentColor" stroke="none" />
      <path d="M6 14l.6 1.8L8.4 16l-1.8.6L6 18.4l-.6-1.8L3.6 16l1.8-.6L6 14z" fill="currentColor" stroke="none" opacity="0.75" />
    </svg>
  );
}

export function IconFileImport(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M14 16H6a2 2 0 0 1-2-2V6" />
      <path d="M10 3h4v4" />
      <path d="M14 3L8 9" />
    </svg>
  );
}

export function IconCloseSmall(props: IconProps) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M6 6l8 8M14 6l-8 8" />
    </svg>
  );
}
