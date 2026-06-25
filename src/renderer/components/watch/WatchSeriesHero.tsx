import { memo } from 'react';
import type { SmartUpNextPlan } from '../../lib/mediaIntelligence/types';
import { formatDuration } from '../../lib/search';
import { resolveMediaDisplay } from '../../lib/mediaIntelligence/mediaDisplay';
import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';
import { useI18n } from '../../i18n/I18nProvider';
import { usePlaybackSelector } from '../../playback/usePlayback';
import { isActivelyPlaying } from '../../playback/playbackTypes';

interface WatchSeriesHeroProps {
  plan: SmartUpNextPlan;
}

/** Compact “now playing” strip — distinct from the large Up Next recommendation hero. */
export const WatchSeriesHero = memo(function WatchSeriesHero(props: WatchSeriesHeroProps) {
  const { t } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const { plan } = props;
  const current = usePlaybackSelector((s) => s.currentTrack);
  const progress = usePlaybackSelector((s) => s.currentTime);
  const duration = usePlaybackSelector((s) => s.duration);
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  if (!current || !plan.currentIdentity) return null;

  const display = resolveMediaDisplay(current, { language: mediaLang });
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const playing = isActivelyPlaying(playbackStatus);

  const episodeNum = plan.episodeIndex ?? plan.currentIdentity.episodeNumber;
  const episodeLabel = episodeNum != null
    ? t('smartPanel.nowPlaying.episode', { num: String(episodeNum).padStart(2, '0') })
    : display.episodeLabel
      ? t('smartPanel.nowPlaying.episode', { num: display.episodeLabel })
      : undefined;

  return (
    <section className="now-playing-card glass-inset" aria-labelledby="now-playing-heading">
      <div className="now-playing-card__head">
        <span className="now-playing-card__live" aria-hidden>
          <span className={`now-playing-card__dot${playing ? ' is-pulsing' : ''}`} />
        </span>
        <p id="now-playing-heading" className="now-playing-card__label">
          {t('smartPanel.nowPlaying.label')}
        </p>
      </div>

      <strong className="now-playing-card__title">{display.title}</strong>

      {episodeLabel && (
        <span className="now-playing-card__episode">{episodeLabel}</span>
      )}

      {plan.episodeIndex != null && plan.episodeCount != null && (
        <span className="now-playing-card__season-pos">
          {t('smartPanel.hero.episodeOf', {
            current: String(plan.episodeIndex).padStart(2, '0'),
            total: String(plan.episodeCount),
          })}
        </span>
      )}

      {duration > 0 && (
        <div className="now-playing-card__progress-block">
          <div
            className="now-playing-card__progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(progress)}
            aria-label={t('smartPanel.nowPlaying.progress')}
          >
            <span className="now-playing-card__progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="now-playing-card__progress-time">
            {formatDuration(progress)} / {formatDuration(duration)}
          </span>
        </div>
      )}

    </section>
  );
});
