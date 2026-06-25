import { memo, useEffect, useMemo, useState } from 'react';
import { formatDuration } from '../../lib/search';
import { reorderQueueById } from '../../lib/playbackNavigation';
import { getMediaIdentity } from '../../lib/mediaIntelligence/mediaIntelligenceService';
import { useSmartUpNextPlan } from '../../lib/mediaIntelligence/useSmartUpNextPlan';
import { perfMark, perfMeasure } from '../../lib/perf';
import { resolveMediaDisplay } from '../../lib/mediaIntelligence/mediaDisplay';
import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';
import { SmartPanelInfoTab } from './SmartPanelInfoTab';
import { itemsInFolder, shuffleItems } from '../../lib/upNextSuggestions';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppShell } from '../../app/AppShellContext';
import { useLibraryDerivedContext } from '../../app/LibraryDerivedContext';
import { usePlaybackSelector } from '../../playback/usePlayback';
import { clearQueue, removeQueueItem, reorderQueue } from '../queue/queueStore';
import { playUiSound } from '../../services/uiAudioService';
import { buildLibraryTitles } from '../../lib/mediaIntelligence/libraryTitleService';
import { filterBrowsableLibraryTitles } from '../../lib/mediaIntelligence/libraryTitleFilters';
import { getCompactForYouItems } from '../../lib/metadata/discoverFeedService';
import { navigateToCatalogTitle, navigateToLocalTitle } from '../library/libraryRouterStore';
import { watchlistStore } from '../library/watchlistStore';
import { registerSmartRightPanelMount } from './rightRailGuard';
import { expandRightPanelTabs } from './sidebarChromeStore';
import { UpNextCard } from '../../components/watch/UpNextCard';
import { WatchSeriesHero } from '../../components/watch/WatchSeriesHero';
import { MediaThumb } from '../../components/watch/MediaThumb';
import type { TranslationKey } from '../../../shared/i18n';
import type { SmartUpNextEntry, SmartUpNextSection } from '../../lib/mediaIntelligence/types';

type SmartTab = 'queue' | 'upNext' | 'info' | 'history' | 'recommendations';

function resolveUpNextSectionLabel(
  section: SmartUpNextSection,
  hero: SmartUpNextEntry | null,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
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

interface SmartRightPanelProps {
  presentation?: 'docked' | 'drawer';
  tabsMode?: 'minimal' | 'full';
}

export const SmartRightPanel = memo(function SmartRightPanel(props: SmartRightPanelProps) {
  const tabsMode = props.tabsMode ?? 'full';
  const { t, locale } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const shell = useAppShell();
  const derived = useLibraryDerivedContext();
  const currentTrack = usePlaybackSelector((s) => s.currentTrack);
  const current = currentTrack ?? shell.currentMedia;
  const [tab, setTab] = useState<SmartTab>(() => (shell.queue.length > 0 ? 'queue' : 'upNext'));
  const [dragQueueId, setDragQueueId] = useState<string | null>(null);

  const mediaIndexKey = String(derived.mediaById.size);

  const upNextPlan = useSmartUpNextPlan({
    current: current ?? undefined,
    mediaById: derived.mediaById,
    historyItems: derived.historyItems,
    uiLanguage: shell.settings.uiLanguage,
    metadataLanguage: shell.settings.metadata?.preferredLanguage,
    uiLocale: locale,
    mediaIndexKey,
  });

  useEffect(() => {
    if (!current) return;
    perfMark('smart-panel-render');
    perfMeasure('smart-panel-upnext-ready', 'smart-panel-render');
  }, [current?.id, upNextPlan.hero?.item.id, upNextPlan.sections.length]);

  const libraryTitles = useMemo(
    () => filterBrowsableLibraryTitles(buildLibraryTitles(derived.library.media, mediaLang)),
    [derived.library.media, mediaLang]
  );

  const recommendations = useMemo(() => {
    return getCompactForYouItems({
      libraryTitles,
      mediaItems: derived.library.media,
      favoriteIds: derived.favoriteIds,
      watchlistCatalogIds: watchlistStore.getState().items.map((i) => i.id),
      includeAdultContent: shell.settings.discovery?.includeAdultContent ?? false,
      currentMediaId: current?.id,
      limit: 6,
    });
  }, [
    libraryTitles,
    derived.library.media,
    derived.favoriteIds,
    current?.id,
    shell.settings.discovery?.includeAdultContent,
  ]);

  const titleById = useMemo(
    () => new Map(libraryTitles.map((title) => [title.id, title])),
    [libraryTitles]
  );

  useEffect(() => registerSmartRightPanelMount(), []);

  useEffect(() => {
    if (shell.queue.length > 0 || current) {
      expandRightPanelTabs();
    }
  }, [shell.queue.length, current?.id]);

  const showFullTabs = tabsMode === 'full';
  const effectiveTab = showFullTabs ? tab : 'upNext';

  const queueEntries = useMemo(
    () => shell.queue.map((queueItem) => ({
      queueItem,
      media: derived.mediaById.get(queueItem.mediaId)
    })),
    [shell.queue, derived.mediaById]
  );

  const folderItems = useMemo(
    () => itemsInFolder(derived.visibleMedia, current?.folder),
    [derived.visibleMedia, current?.folder]
  );

  function handleDrop(targetQueueId: string) {
    if (!dragQueueId || dragQueueId === targetQueueId) return;
    reorderQueue(reorderQueueById(shell.queue, dragQueueId, targetQueueId));
    setDragQueueId(null);
  }

  const addFolderToQueue = () => {
    shell.addManyToQueue(folderItems.slice(0, 40));
  };

  const shuffleVisible = () => {
    const pick = shuffleItems(derived.visibleMedia.filter((item) => item.filePath)).slice(0, 12);
    for (const item of pick) shell.addToQueue(item);
  };

  const presentationClass = props.presentation === 'drawer' ? ' smart-panel--drawer' : ' smart-panel--docked';

  return (
    <aside className={`smart-right-panel smart-glass-panel${presentationClass}`}>
      <div className="smart-panel__header">
        {showFullTabs ? (
          <div className="smart-panel__tabs">
            {(['queue', 'upNext', 'recommendations', 'info', 'history'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={tab === id ? 'smart-tab-pill is-active' : 'smart-tab-pill'}
                onClick={() => setTab(id)}
              >
                {t(`smartPanel.tab.${id}`)}
              </button>
            ))}
          </div>
        ) : (
          <p className="smart-panel__compact-label">{t('smartPanel.tab.upNext')}</p>
        )}
      </div>

      <div key={effectiveTab} className="smart-panel__body prism-tab-content-enter">
        {effectiveTab === 'upNext' && showFullTabs && shell.queue.length > 0 && (
          <div className="smart-panel__queue-hint glass-inset">
            <p className="smart-panel__section-label">{t('smartPanel.queue.activeHint')}</p>
            <button type="button" className="ghost-button" onClick={() => setTab('queue')}>
              {t('smartPanel.tab.queue')} ({shell.queue.length})
            </button>
          </div>
        )}

        {effectiveTab === 'upNext' && current?.kind === 'video' && (
          <WatchSeriesHero plan={upNextPlan} />
        )}

        {effectiveTab === 'upNext' && upNextPlan.hero && (
          <UpNextCard
            entry={upNextPlan.hero}
            variant="hero"
            onPlay={shell.playMedia}
            onQueue={shell.addToQueue}
          />
        )}

        {effectiveTab === 'queue' && (
          <>
            {queueEntries.length === 0 ? (
              <div className="smart-panel__empty glass-inset">
                <p>{t('smartPanel.queue.empty')}</p>
                <div className="smart-panel__actions">
                  <button type="button" className="ghost-button" disabled={!current?.folder} onClick={addFolderToQueue}>
                    {t('smartPanel.action.addFolder')}
                  </button>
                  <button type="button" className="ghost-button" onClick={shuffleVisible}>
                    {t('smartPanel.action.shuffleVisible')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="smart-panel__queue-toolbar">
                  <button type="button" className="ghost-button" onClick={() => { playUiSound('warning'); clearQueue(); }}>
                    {t('queue.clear')}
                  </button>
                </div>
                {queueEntries.map(({ queueItem, media }, index) => (
                  <article
                    key={queueItem.id}
                    className={`up-next-card up-next-card--queue${media && current?.id === media.id ? ' is-playing' : ''}`}
                    draggable={Boolean(media)}
                    onDragStart={() => setDragQueueId(queueItem.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(queueItem.id)}
                    onDragEnd={() => setDragQueueId(null)}
                  >
                    {media ? (
                      <>
                        <MediaThumb item={media} size="row" />
                        <div className="up-next-card__body">
                          <span className="up-next-card__reason">{String(index + 1).padStart(2, '0')}</span>
                          <strong className="up-next-card__title">
                            {resolveMediaDisplay(media, { language: mediaLang }).title}
                          </strong>
                          <span className="up-next-card__meta">{formatDuration(media.durationSeconds)}</span>
                        </div>
                        <button type="button" className="up-next-card__icon-btn" onClick={() => { playUiSound('queue_remove'); removeQueueItem(queueItem.id); }}>×</button>
                      </>
                    ) : (
                      <span>{t('queue.missing.title')}</span>
                    )}
                  </article>
                ))}
              </>
            )}
          </>
        )}

        {effectiveTab === 'upNext' && (
          <div className="smart-panel__up-next-list">
            {upNextPlan.sections.map((section) => (
              <div key={section.id} className="smart-panel__section">
                <p className="smart-panel__section-label">
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
            {upNextPlan.sections.length === 0 && !upNextPlan.hero && (
              <div className="smart-panel__empty glass-inset">
                <p>{t('smartPanel.upNext.noVideos')}</p>
                <button type="button" className="ghost-button" onClick={shell.modeTransitions.enterLibrary}>
                  {t('player.backToLibrary')}
                </button>
              </div>
            )}
          </div>
        )}

        {effectiveTab === 'recommendations' && (
          <div className="smart-panel__up-next-list">
            {recommendations.length === 0 ? (
              <div className="smart-panel__empty glass-inset">
                <p>{t('smartPanel.recommendations.empty')}</p>
              </div>
            ) : (
              recommendations.map((item) => {
                const localTitle = item.localTitleId ? titleById.get(item.localTitleId) : undefined;
                const media = localTitle?.items[0];
                return (
                  <article key={item.catalogId ?? item.localTitleId ?? item.title} className="up-next-card up-next-card--compact">
                    {media && <MediaThumb item={media} size="row" />}
                    <div className="up-next-card__body">
                      <span className="up-next-card__reason">
                        {t(item.reasonKey as TranslationKey)}
                      </span>
                      <strong className="up-next-card__title">{item.title}</strong>
                      <span className="up-next-card__meta">{[item.type, item.year].filter(Boolean).join(' · ')}</span>
                    </div>
                    <button
                      type="button"
                      className="ghost-button pill-button--compact"
                      onClick={() => {
                        playUiSound('open');
                        if (item.localTitleId) {
                          navigateToLocalTitle(item.localTitleId);
                          return;
                        }
                        if (item.catalogId) navigateToCatalogTitle(item.catalogId);
                      }}
                    >
                      {t('catalog.openDetails')}
                    </button>
                  </article>
                );
              })
            )}
          </div>
        )}

        {effectiveTab === 'info' && current && (
          <SmartPanelInfoTab
            current={current}
            mediaLang={mediaLang}
            uiLocale={locale}
            uiLanguage={shell.settings.uiLanguage}
            metadataLanguage={shell.settings.metadata?.preferredLanguage}
            mediaById={derived.mediaById}
            t={t}
            onFavorite={() => shell.toggleFavorite(current)}
          />
        )}

        {effectiveTab === 'history' && (
          <div className="smart-panel__up-next-list">
            {derived.historyItems.length === 0 ? (
              <div className="smart-panel__empty glass-inset">
                <p>{t('queue.history.empty.title')}</p>
              </div>
            ) : (
              derived.historyItems.map((item) => (
                <UpNextCard
                  key={item.id}
                  entry={{
                    item,
                    section: 'alsoFromLibrary',
                    score: 0,
                    reasons: ['history'],
                    identity: getMediaIdentity(item, mediaLang),
                    source: 'local-library',
                  }}
                  onPlay={shell.playMedia}
                  onQueue={shell.addToQueue}
                />
              ))
            )}
          </div>
        )}

        {!showFullTabs && (
          <button
            type="button"
            className="ghost-button smart-panel__expand-tabs"
            onClick={() => expandRightPanelTabs()}
          >
            {t('shell.rightPanel.showMore')}
          </button>
        )}
      </div>
    </aside>
  );
});
