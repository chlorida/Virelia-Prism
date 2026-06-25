import { memo } from 'react';
import { titleInitials } from '../../lib/mediaIntelligence/titleArtwork';

interface TitleCardFallbackProps {
  title: string;
  mediaType: string;
  loading?: boolean;
  /** Embedded in small poster slots (franchise/search rows). No absolute layout or shimmer. */
  size?: 'card' | 'embed';
}

const TYPE_GLYPH: Record<string, string> = {
  series: '▦',
  movie: '◆',
  ova: '◎',
  special: '✦',
  audio: '♪',
  unknown: '▣',
};

export const TitleCardFallback = memo(function TitleCardFallback(props: TitleCardFallbackProps) {
  const glyph = TYPE_GLYPH[props.mediaType] ?? TYPE_GLYPH.unknown;
  const initials = titleInitials(props.title);

  return (
    <div
      className={[
        'prism-title-card__fallback',
        `prism-title-card__fallback--${props.mediaType}`,
        props.size === 'embed' ? 'prism-title-card__fallback--embed' : '',
        props.loading && props.size !== 'embed' ? 'is-loading' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden
    >
      <span className="prism-title-card__fallback-glyph">{glyph}</span>
      <span className="prism-title-card__fallback-initials">{initials}</span>
      {props.loading && props.size !== 'embed' && (
        <span className="prism-title-card__fallback-shimmer" />
      )}
    </div>
  );
});
