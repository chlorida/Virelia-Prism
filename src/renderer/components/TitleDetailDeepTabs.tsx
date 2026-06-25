import { memo, useMemo, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import type { EnrichedTitleMetadata, TitleMetadataRecord } from '../../shared/titleMetadataTypes';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { formatDuration } from '../lib/search';
import { formatFolderLabelForDisplay } from '../lib/pathDisplay';
import type { TranslationKey } from '../../shared/i18n';
import type { useI18n } from '../i18n/I18nProvider';
import { TitleMediaGallery } from './titleDetail/TitleMediaGallery';
import { TitleExploreTab } from './titleDetail/TitleExploreTab';
import { useTitleLocalFrames } from '../hooks/useTitleLocalFrames';
import { TitleCharactersTab } from './titleDetail/TitleCharactersTab';
import { buildFranchiseTitleContext } from '../lib/mediaIntelligence/franchise/franchiseService';
import { isAlbumLibraryTitle } from '../lib/mediaIntelligence/audioAlbumService';
import { playUiSound } from '../services/uiAudioService';

export type TitleDetailTab = 'episodes' | 'tracks' | 'details' | 'characters' | 'explore' | 'media' | 'files';

interface TitleDetailDeepTabsProps {
  activeTab: TitleDetailTab;
  onTabChange: (tab: TitleDetailTab) => void;
  title: LibraryTitle;
  libraryTitles: LibraryTitle[];
  localFramesEpoch?: number;
  metaRecord?: TitleMetadataRecord;
  enriched?: EnrichedTitleMetadata;
  isSeries: boolean;
  heroItem?: MediaItem;
  heroDuration?: number;
  folderLabel: string;
  versionChips: string[];
  kindKey: string;
  durationById: Record<string, number>;
  onPlayFile?: (item: MediaItem) => void;
  onOpenLocalTitle?: (titleId: string) => void;
  onOpenFranchise?: (franchiseId: string) => void;
  t: ReturnType<typeof useI18n>['t'];
  children?: React.ReactNode;
}

function hasCharacters(enriched?: EnrichedTitleMetadata): boolean {
  return (enriched?.characters?.length ?? 0) > 0
    || (enriched?.cast?.length ?? 0) > 0
    || (enriched?.voiceActors?.length ?? 0) > 0;
}

function hasExplore(title: LibraryTitle, libraryTitles: LibraryTitle[], enriched?: EnrichedTitleMetadata): boolean {
  if ((enriched?.relatedTitles?.length ?? 0) > 0) return true;
  return Boolean(buildFranchiseTitleContext(title, libraryTitles));
}

export function getAvailableDetailTabs(
  title: LibraryTitle,
  isSeries: boolean,
  libraryTitles: LibraryTitle[],
  enriched?: EnrichedTitleMetadata,
  metaRecord?: TitleMetadataRecord
): TitleDetailTab[] {
  const tabs: TitleDetailTab[] = [];
  if (isSeries) tabs.push('episodes');
  if (isAlbumLibraryTitle(title)) tabs.push('tracks');
  tabs.push('media');
  if (hasCharacters(enriched)) tabs.push('characters');
  if (hasExplore(title, libraryTitles, enriched)) tabs.push('explore');
  if (title.totalFileCount > 1 || title.duplicateVersionCount > 0) tabs.push('files');
  tabs.push('details');
  return tabs;
}

export const TitleDetailDeepTabs = memo(function TitleDetailDeepTabs(props: TitleDetailDeepTabsProps) {
  const {
    activeTab, onTabChange, title, libraryTitles, metaRecord, enriched, isSeries,
    heroItem, heroDuration, folderLabel, versionChips, kindKey, durationById,
    onPlayFile, onOpenLocalTitle, onOpenFranchise, t, children,
  } = props;

  const tabs = getAvailableDetailTabs(title, isSeries, libraryTitles, enriched, metaRecord);
  const primaryTabs = tabs.filter((tab) => tab !== 'details');
  const { frames: localFrames } = useTitleLocalFrames(title, props.localFramesEpoch);
  const mediaBundle = useMemo(() => {
    const base = metaRecord?.cachedMedia ?? enriched?.media;
    if (!base && localFrames.length === 0) return undefined;
    return {
      ...(base ?? {}),
      localFrames: localFrames.length > 0 ? localFrames : base?.localFrames,
    };
  }, [metaRecord?.cachedMedia, enriched?.media, localFrames]);

  const handleTabChange = (tab: TitleDetailTab) => {
    if (tab !== activeTab) playUiSound('tab');
    onTabChange(tab);
  };

  return (
    <>
      <div className="title-detail-tabs" role="tablist" aria-label={t('media.titles.detail.sections')}>
        <div className="title-detail-tabs__primary">
          {primaryTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? 'title-detail-tabs__tab is-active' : 'title-detail-tabs__tab'}
              onClick={() => handleTabChange(tab)}
            >
              {t(`media.titles.tab.${tab}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'details'}
          className={activeTab === 'details' ? 'title-detail-tabs__tab title-detail-tabs__tab--details is-active' : 'title-detail-tabs__tab title-detail-tabs__tab--details'}
          onClick={() => handleTabChange('details')}
        >
          {t('media.titles.tab.details')}
        </button>
      </div>

      {metaRecord?.state === 'metadataFailed' && activeTab !== 'details' && (
        <p className="title-detail-meta-status muted">{t('media.titles.metadata.unavailable')}</p>
      )}
      {metaRecord?.state === 'metadataNeedsReview' && activeTab !== 'details' && (
        <p className="title-detail-meta-status muted">{t('media.titles.metadata.needsReview')}</p>
      )}
      {import.meta.env.DEV && activeTab === 'details' && metaRecord && (metaRecord.matchQuery || metaRecord.matchedTitle) && (
        <dl className="title-detail-info__grid title-detail-meta-debug muted">
          {metaRecord.matchQuery && (
            <div><dt>metadata query</dt><dd>{metaRecord.matchQuery}</dd></div>
          )}
          {metaRecord.matchedProvider && (
            <div><dt>provider</dt><dd>{metaRecord.matchedProvider}</dd></div>
          )}
          {metaRecord.matchedTitle && (
            <div><dt>matched title</dt><dd>{metaRecord.matchedTitle}</dd></div>
          )}
          <div><dt>confidence</dt><dd>{(metaRecord.confidence * 100).toFixed(0)}%</dd></div>
          {metaRecord.appliedTo && (
            <div><dt>applied to</dt><dd>{metaRecord.appliedTo}</dd></div>
          )}
          {metaRecord.posterDisplayUrl && (
            <div><dt>poster source</dt><dd>online cache</dd></div>
          )}
          {metaRecord.backdropDisplayUrl && (
            <div><dt>backdrop source</dt><dd>online cache</dd></div>
          )}
        </dl>
      )}

      <div key={activeTab} className="prism-tab-content-enter">
      {children}

      {activeTab === 'details' && (
        <section className="title-detail-deep title-detail-deep--details">
          <dl className="title-detail-info__grid">
            {enriched?.format && (
              <div><dt>{t('media.titles.detail.type')}</dt><dd>{enriched.format}</dd></div>
            )}
            {!enriched?.format && heroItem && (
              <div><dt>{t('media.titles.detail.type')}</dt><dd>{t(`media.titles.kind.${kindKey}` as TranslationKey)}</dd></div>
            )}
            {(enriched?.year ?? title.year) != null && (
              <div><dt>{t('media.titles.detail.year')}</dt><dd>{enriched?.year ?? title.year}</dd></div>
            )}
            {enriched?.season && (
              <div><dt>{t('media.titles.detail.season')}</dt><dd>{enriched.season}</dd></div>
            )}
            {isSeries && (
              <div><dt>{t('media.titles.detail.episodes')}</dt><dd>{title.uniqueEpisodeCount}</dd></div>
            )}
            {enriched?.duration != null && (
              <div><dt>{t('media.titles.detail.episodeDuration')}</dt><dd>{formatDuration(enriched.duration * 60)}</dd></div>
            )}
            {!isSeries && heroDuration != null && (
              <div><dt>{t('media.titles.detail.duration')}</dt><dd>{formatDuration(heroDuration)}</dd></div>
            )}
            {enriched?.rating != null && (
              <div><dt>{t('media.titles.detail.ratingLabel')}</dt><dd>{enriched.rating.toFixed(1)}</dd></div>
            )}
            {enriched?.popularity != null && (
              <div><dt>{t('media.titles.detail.popularity')}</dt><dd>{enriched.popularity}</dd></div>
            )}
            {enriched?.status && (
              <div><dt>{t('media.titles.detail.status')}</dt><dd>{enriched.status}</dd></div>
            )}
            {enriched?.studios?.[0] && (
              <div><dt>{t('media.titles.detail.studio')}</dt><dd>{enriched.studios.join(', ')}</dd></div>
            )}
            {enriched?.source && (
              <div><dt>{t('media.titles.detail.adaptationSource')}</dt><dd>{enriched.source}</dd></div>
            )}
            {enriched?.country && (
              <div><dt>{t('media.titles.detail.country')}</dt><dd>{enriched.country}</dd></div>
            )}
            {enriched?.tags && enriched.tags.length > 0 && (
              <div className="title-detail-deep__tags">
                <dt>{t('media.titles.detail.tags')}</dt>
                <dd>
                  <div className="title-detail-info__chips">
                    {enriched.tags.slice(0, 8).map((tag) => (
                      <span key={tag} className="meta-chip meta-chip--compact">{tag}</span>
                    ))}
                  </div>
                </dd>
              </div>
            )}
            {folderLabel && (
              <div><dt>{t('media.table.folder')}</dt><dd>{folderLabel}</dd></div>
            )}
            {heroItem && (
              <div className="title-detail-info__file">
                <dt>{t('media.titles.detail.source')}</dt>
                <dd className="smart-panel__mono">{heroItem.fileName}</dd>
              </div>
            )}
            <div><dt>{t('media.titles.detail.files')}</dt><dd>{title.totalFileCount}</dd></div>
          </dl>
          {versionChips.length > 0 && (
            <div className="title-detail-info__chips">
              {versionChips.map((tag) => (
                <span key={tag} className="meta-chip">{tag.toUpperCase()}</span>
              ))}
            </div>
          )}
          {enriched?.externalUrl && (
            <p className="title-detail-deep__external">
              <a href={enriched.externalUrl} target="_blank" rel="noreferrer noopener">
                {t('media.titles.detail.externalLink')}
              </a>
            </p>
          )}
        </section>
      )}

      {activeTab === 'characters' && (
        <TitleCharactersTab characters={enriched?.characters} />
      )}

      {activeTab === 'explore' && (
        <TitleExploreTab
          title={title}
          related={enriched?.relatedTitles}
          libraryTitles={libraryTitles}
          onOpenLocalTitle={onOpenLocalTitle}
          onOpenFranchise={onOpenFranchise}
        />
      )}

      {activeTab === 'media' && (
        <TitleMediaGallery
          media={mediaBundle}
          trailerUrl={enriched?.trailerUrl ?? metaRecord?.cachedMedia?.trailer?.url}
          trailerThumbnailUrl={enriched?.trailerThumbnailUrl ?? metaRecord?.cachedMedia?.trailer?.thumbnailUrl}
        />
      )}

      {activeTab === 'files' && (
        <section className="title-detail-versions title-detail-deep--files">
          <h2 className="title-detail-versions__heading">{t('media.titles.filesSection')}</h2>
          <ul className="title-detail-panel__version-list">
            {title.items.map((item) => (
              <li key={item.id}>
                {onPlayFile ? (
                  <button type="button" className="title-detail-panel__version-row" onClick={() => onPlayFile(item)}>
                    <span className="smart-panel__mono">{item.fileName}</span>
                    {item.id === title.preferredItemId && (
                      <span className="meta-chip meta-chip--compact">{t('media.titles.preferredVersion')}</span>
                    )}
                    <span className="muted">{formatDuration(durationById[item.id] ?? item.durationSeconds)}</span>
                  </button>
                ) : (
                  <div className="title-detail-panel__version-row title-detail-panel__version-row--static">
                    <span className="smart-panel__mono">{item.fileName}</span>
                    {item.id === title.preferredItemId && (
                      <span className="meta-chip meta-chip--compact">{t('media.titles.preferredVersion')}</span>
                    )}
                    <span className="muted">{formatDuration(durationById[item.id] ?? item.durationSeconds)}</span>
                  </div>
                )}
                {item.folder && (
                  <span className="title-detail-deep__file-folder muted">{formatFolderLabelForDisplay(item.folder)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </>
  );
});
