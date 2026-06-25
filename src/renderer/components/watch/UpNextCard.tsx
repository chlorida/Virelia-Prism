import { memo, useState } from 'react';
import type { MediaItem } from '../../../shared/types';
import type { SmartUpNextEntry } from '../../lib/mediaIntelligence/types';
import { resolveMediaDisplay } from '../../lib/mediaIntelligence/mediaDisplay';
import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';
import { formatDuration } from '../../lib/search';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../../shared/i18n';
import { MediaThumb } from './MediaThumb';

interface UpNextCardProps {
  entry: SmartUpNextEntry;
  variant?: 'default' | 'hero';
  onPlay: (item: MediaItem) => void;
  onQueue: (item: MediaItem) => void;
}

const REASON_KEYS: Record<string, TranslationKey> = {
  nextEpisode: 'smartPanel.reason.nextEpisode',
  thisSeason: 'smartPanel.reason.thisSeason',
  sameFolder: 'smartPanel.reason.sameFolder',
  relatedSeason: 'smartPanel.reason.relatedSeason',
  continueWatching: 'smartPanel.reason.continueWatching',
  alsoFromLibrary: 'smartPanel.reason.alsoFromLibrary',
  audioFallback: 'smartPanel.reason.audioFallback',
  similar: 'smartPanel.reason.similar',
  sequence: 'smartPanel.reason.sequence',
  history: 'smartPanel.reason.history',
};

function reasonKey(section: string): TranslationKey {
  return REASON_KEYS[section] ?? 'smartPanel.reason.video';
}

export const UpNextCard = memo(function UpNextCard(props: UpNextCardProps) {
  const { t } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const { entry, variant = 'default' } = props;
  const { item, identity } = entry;
  const display = resolveMediaDisplay(item, { language: mediaLang });
  const [hover, setHover] = useState(false);
  const isHero = variant === 'hero';
  const progress = item.durationSeconds && item.resumePositionSeconds
    ? Math.round((item.resumePositionSeconds / item.durationSeconds) * 100)
    : 0;

  const thumbSize = isHero ? 'hero' : item.kind === 'video' ? 'row' : 'row-audio';
  const chips = display.chips.slice(0, 3);

  let reasonLabel = t(reasonKey(entry.section));
  if (entry.section === 'relatedSeason' && entry.franchiseLabel) {
    reasonLabel = `${reasonLabel} · ${entry.franchiseLabel}`;
  }

  const epNum = identity.episodeNumber ?? display.episodeLabel;
  const episodeHeadline = epNum != null
    ? t('smartPanel.upNext.episodeHeadline', { num: String(epNum).padStart(2, '0') })
    : undefined;
  const nextEpisodeHeadline = epNum != null
    ? t('smartPanel.upNext.nextEpisodeHeadline', { num: String(epNum).padStart(2, '0') })
    : undefined;

  const helperText = entry.section === 'nextEpisode'
    ? t('smartPanel.upNext.helperAfterCurrent')
    : entry.section === 'thisSeason'
      ? t('smartPanel.upNext.helperThisSeason')
      : undefined;

  const playNextLabel = t('smartPanel.playNext');
  const playNextAria = t('smartPanel.upNext.playNextAria');

  return (
    <article
      className={`up-next-card up-next-card--${variant}${isHero ? ' up-next-card--recommendation' : ''}`}
      role={isHero ? 'group' : 'button'}
      aria-label={isHero ? playNextAria : undefined}
      tabIndex={isHero ? undefined : 0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={isHero ? undefined : () => props.onPlay(item)}
      onKeyDown={isHero ? undefined : (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onPlay(item);
        }
      }}
    >
      <MediaThumb item={item} size={thumbSize} priority={isHero ? 'high' : 'normal'} lazy={!isHero} />
      <div className="up-next-card__body">
        {isHero ? (
          <>
            <span className="up-next-card__hero-label">{t('smartPanel.upNext.label')}</span>
            {nextEpisodeHeadline && (
              <span className="up-next-card__episode-headline">{nextEpisodeHeadline}</span>
            )}
            {episodeHeadline && !nextEpisodeHeadline && (
              <span className="up-next-card__episode-headline">{episodeHeadline}</span>
            )}
            {helperText && (
              <span className="up-next-card__helper">{helperText}</span>
            )}
          </>
        ) : (
          <span className="up-next-card__reason">{reasonLabel}</span>
        )}
        <strong className="up-next-card__title" title={display.title}>{display.title}</strong>
        <span className="up-next-card__meta">
          {item.kind === 'video' ? t('media.kind.video') : t('media.kind.audio')}
          {' · '}
          {formatDuration(item.durationSeconds)}
          {!isHero && progress > 5 && progress < 95 ? ` · ${progress}%` : ''}
        </span>
        {chips.length > 0 && (
          <span className="up-next-card__chips">
            {chips.map((chip) => (
              <span key={chip} className="meta-chip meta-chip--compact">{chip}</span>
            ))}
          </span>
        )}
        {isHero && (
          <button
            type="button"
            className="pill-button pill-button--accent up-next-card__hero-play"
            aria-label={playNextAria}
            title={playNextLabel}
            onClick={() => props.onPlay(item)}
          >
            {playNextLabel}
          </button>
        )}
      </div>
      {!isHero && (
        <div className={`up-next-card__hover-actions${hover ? ' is-visible' : ''}`}>
          <button
            type="button"
            className="up-next-card__icon-btn"
            aria-label={playNextAria}
            title={playNextLabel}
            onClick={(e) => {
              e.stopPropagation();
              props.onPlay(item);
            }}
          >
            ▶
          </button>
          <button
            type="button"
            className="up-next-card__icon-btn"
            aria-label={t('media.queue.add')}
            onClick={(e) => {
              e.stopPropagation();
              props.onQueue(item);
            }}
          >
            +
          </button>
        </div>
      )}
    </article>
  );
});
