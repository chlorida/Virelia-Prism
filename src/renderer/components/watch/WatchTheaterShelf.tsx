import { memo } from 'react';

import type { SmartUpNextEntry, SmartUpNextSection } from '../../lib/mediaIntelligence/types';
import { useSmartUpNextPlan } from '../../lib/mediaIntelligence/useSmartUpNextPlan';
import { useAppShell } from '../../app/AppShellContext';
import { useLibraryDerivedContext } from '../../app/LibraryDerivedContext';
import { usePlaybackSelector } from '../../playback/usePlayback';
import { useI18n } from '../../i18n/I18nProvider';
import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';
import type { TranslationKey } from '../../../shared/i18n';
import { UpNextCard } from './UpNextCard';
import { WatchSeriesHero } from './WatchSeriesHero';

function resolveUpNextSectionLabel(
  section: SmartUpNextSection,
  hero: SmartUpNextEntry | null,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  if (section.id !== 'thisSeason' || !hero) {
    return t(section.labelKey as TranslationKey);
  }
  const heroEp = hero.identity.episodeNumber;
  const first = section.entries[0];
  if (!first || heroEp == null) return t('smartPanel.section.thisSeason');
  if (first.item.id === hero.item.id) return t('smartPanel.section.thisSeason');
  const firstEp = first.identity.episodeNumber;
  if (firstEp != null && firstEp > heroEp) {
    return t('smartPanel.section.moreThisSeason');
  }
  return t('smartPanel.section.thisSeason');
}

export const WatchTheaterShelf = memo(function WatchTheaterShelf() {
  const shell = useAppShell();
  const derived = useLibraryDerivedContext();
  const { t, locale } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const track = usePlaybackSelector((s) => s.currentTrack);
  const mediaIndexKey = String(derived.mediaById.size);

  const upNextPlan = useSmartUpNextPlan({
    current: track ?? undefined,
    mediaById: derived.mediaById,
    historyItems: derived.historyItems,
    uiLanguage: shell.settings.uiLanguage,
    metadataLanguage: shell.settings.metadata?.preferredLanguage ?? mediaLang,
    uiLocale: locale,
    mediaIndexKey,
  });

  if (!track) return null;

  const hasContent = Boolean(upNextPlan.hero) || upNextPlan.sections.length > 0;

  return (
    <section className="watch-theater-shelf" aria-label={t('smartPanel.tab.upNext')}>
      {track.kind === 'video' && <WatchSeriesHero plan={upNextPlan} />}

      {upNextPlan.hero && (
        <UpNextCard
          entry={upNextPlan.hero}
          variant="hero"
          onPlay={shell.playMedia}
          onQueue={shell.addToQueue}
        />
      )}

      {upNextPlan.sections.map((section) => (
        <div key={section.id} className="watch-theater-shelf__section">
          <p className="watch-theater-shelf__label">
            {resolveUpNextSectionLabel(section, upNextPlan.hero, t)}
          </p>
          {section.entries.map((entry) => (
            <UpNextCard
              key={`${section.id}-${entry.item.id}`}
              entry={entry}
              onPlay={shell.playMedia}
              onQueue={shell.addToQueue}
            />
          ))}
        </div>
      ))}

      {!hasContent && (
        <div className="watch-theater-shelf__empty glass-inset">
          <p>{t('smartPanel.upNext.noVideos')}</p>
        </div>
      )}
    </section>
  );
});
