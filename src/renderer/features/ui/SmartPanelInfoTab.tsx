import { memo, useEffect, useState } from 'react';
import type { MediaItem, UiLanguagePreference } from '../../../shared/types';
import type { UiLocale, TranslationKey } from '../../../shared/i18n';
import type { ThumbnailApiRecord } from '../../../shared/prismApi.types';
import { formatDuration } from '../../lib/search';
import { getMediaDisplay } from '../../lib/mediaIntelligence/mediaIntelligenceService';
import { isRecommendableLocalItem } from '../../lib/mediaIntelligence/playableMediaFilter';
import { getMediaPlaybackHealth } from '../../lib/mediaIntelligence/mediaPlaybackHealth';
import { findRelatedFranchiseVideos } from '../../lib/mediaIntelligence/franchiseGrouping';
import {
  buildLibraryTitles,
  findLibraryTitleById,
} from '../../lib/mediaIntelligence/libraryTitleService';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../../lib/mediaIntelligence/titlePlaybackService';
import { libraryStore } from '../library/libraryStore';
import { useStore } from '../../lib/useStore';
import { collectRecommendationCandidates } from '../../lib/mediaIntelligence/recommendationCandidates';
import { formatFolderLabelForDisplay, formatPathForCopy, formatPathForDisplay } from '../../lib/pathDisplay';
import {
  detectFfmpegInEnvironment,
  ensureThumbnail,
  getThumbnailState,
  retryThumbnailForItem,
  subscribeThumbnails,
} from '../../lib/mediaIntelligence/thumbnailService';
import type { MediaDisplayLanguage } from '../../lib/mediaIntelligence/languageResolution';
import { MediaThumb } from '../../components/watch/MediaThumb';

interface SmartPanelInfoTabProps {
  current: MediaItem;
  mediaLang: MediaDisplayLanguage;
  uiLocale: UiLocale;
  uiLanguage: UiLanguagePreference;
  metadataLanguage?: UiLanguagePreference;
  mediaById: Map<string, MediaItem>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onFavorite: () => void;
}

function thumbnailStatusLabel(
  t: SmartPanelInfoTabProps['t'],
  record?: ThumbnailApiRecord
): string {
  switch (record?.status) {
    case 'ready':
      return t('smartPanel.info.thumbnailReady');
    case 'queued':
    case 'generating':
      return t('smartPanel.info.thumbnailPending');
    case 'ffmpeg-missing':
      return t('smartPanel.info.ffmpegNo');
    case 'failed':
      return record.error ?? t('smartPanel.info.thumbnailMissing');
    case 'path-not-allowed':
      return record.error ?? t('smartPanel.info.pathNotAllowed');
    case 'file-missing':
      return record.error ?? t('smartPanel.info.fileMissing');
    case 'unsupported':
      return record.error ?? t('smartPanel.info.unsupported');
    default:
      return t('smartPanel.info.thumbnailMissing');
  }
}

export const SmartPanelInfoTab = memo(function SmartPanelInfoTab(props: SmartPanelInfoTabProps) {
  const { current, mediaLang, mediaById, t } = props;
  const display = getMediaDisplay(current, mediaLang);
  const parsed = display.parsed;
  const [, setThumbRevision] = useState(0);
  const thumb = getThumbnailState(current.id);
  const playbackHealth = getMediaPlaybackHealth(current.id);
  const relatedCount = findRelatedFranchiseVideos(
    current,
    collectRecommendationCandidates(current, [], mediaById),
    mediaLang
  ).length;
  const selectedTitleId = useStore(libraryStore, (state) => state.selectedTitleId);
  const allTitles = buildLibraryTitles([...mediaById.values()], mediaLang);
  const selectedTitle = findLibraryTitleById(allTitles, selectedTitleId);
  const titleGroup = selectedTitle ?? buildLibraryTitles([current], mediaLang)[0];
  const titleProgress = selectedTitle ? getTitleProgressSummary(selectedTitle) : undefined;
  const preferredPlay = selectedTitle ? resolveTitlePlayTarget(selectedTitle) : undefined;
  const [ffmpeg, setFfmpeg] = useState<{ available: boolean; path?: string } | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  useEffect(() => {
    void detectFfmpegInEnvironment().then(setFfmpeg);
  }, []);

  useEffect(() => {
    if (current.kind === 'video') void ensureThumbnail(current);
    return subscribeThumbnails((mediaId) => {
      if (mediaId === current.id) setThumbRevision((n) => n + 1);
    });
  }, [current.id, current.kind, current.filePath]);

  return (
    <div className="smart-panel__info glass-inset">
      <MediaThumb item={current} size="hero" priority="high" lazy={false} />
      <h3 className="smart-panel__info-title">{selectedTitle?.displayTitle ?? display.title}</h3>
      {display.technicalChips.length > 0 && (
        <div className="smart-panel__chip-row">
          {display.technicalChips.map((chip) => (
            <span key={chip} className="meta-chip">{chip}</span>
          ))}
        </div>
      )}
      <dl className="smart-panel__meta smart-panel__meta--dense">
        {selectedTitle && (
          <>
            <div><dt>{t('smartPanel.info.titleLevel')}</dt><dd>{titleGroup?.displayTitle ?? '—'}</dd></div>
            <div><dt>{t('smartPanel.info.mediaType')}</dt><dd>{selectedTitle.mediaType}</dd></div>
            <div><dt>{t('smartPanel.info.titleEpisodes')}</dt><dd>{selectedTitle.uniqueEpisodeCount}</dd></div>
            <div><dt>{t('smartPanel.info.titleItems')}</dt><dd>{selectedTitle.totalFileCount}</dd></div>
            <div><dt>{t('smartPanel.info.titleVersions')}</dt><dd>{selectedTitle.duplicateVersionCount}</dd></div>
            <div><dt>{t('smartPanel.info.preferredPlay')}</dt><dd>{preferredPlay?.item.fileName ?? '—'}</dd></div>
            <div><dt>{t('smartPanel.info.titleProgress')}</dt><dd>{titleProgress?.hasProgress ? t('media.titles.inProgress') : '—'}</dd></div>
          </>
        )}
        <div><dt>{t('smartPanel.info.currentFile')}</dt><dd className="smart-panel__mono">{current.fileName}</dd></div>
        <div><dt>{t('smartPanel.info.kind')}</dt><dd>{current.kind === 'video' ? t('media.kind.video') : t('media.kind.audio')}</dd></div>
        <div><dt>{t('smartPanel.info.duration')}</dt><dd>{formatDuration(current.durationSeconds)}</dd></div>
        {parsed.episodeNumber != null && (
          <div><dt>{t('smartPanel.info.episode')}</dt><dd>{parsed.episodeNumber}</dd></div>
        )}
      </dl>
      <button
        type="button"
        className="ghost-button"
        onClick={() => setShowTechnical((open) => !open)}
      >
        {showTechnical ? t('smartPanel.info.hideTechnical') : t('smartPanel.info.showTechnical')}
      </button>
      {showTechnical && (
        <dl className="smart-panel__meta smart-panel__meta--dense">
          <div><dt>{t('smartPanel.info.uiLanguage')}</dt><dd>{props.uiLocale}</dd></div>
          <div><dt>{t('smartPanel.info.metadataLanguage')}</dt><dd>{mediaLang}</dd></div>
          <div><dt>{t('smartPanel.info.displaySource')}</dt><dd>{display.source}</dd></div>
          <div><dt>{t('smartPanel.info.confidence')}</dt><dd>{Math.round(display.confidence * 100)}%</dd></div>
          <div><dt>{t('smartPanel.info.playable')}</dt><dd>{isRecommendableLocalItem(current) ? 'yes' : 'no'}</dd></div>
          <div><dt>{t('smartPanel.info.recommendEligible')}</dt><dd>{isRecommendableLocalItem(current, current.id) ? 'yes' : 'no'}</dd></div>
          <div><dt>{t('smartPanel.info.relatedGroups')}</dt><dd>{relatedCount}</dd></div>
          <div><dt>{t('smartPanel.info.seriesGroup')}</dt><dd>{parsed.franchiseId ?? '—'}</dd></div>
          <div><dt>{t('smartPanel.info.canonicalTitle')}</dt><dd>{parsed.canonicalTitle ?? parsed.cleanTitle}</dd></div>
          <div><dt>{t('smartPanel.info.rawFilename')}</dt><dd className="smart-panel__mono">{current.fileName}</dd></div>
          <div><dt>{t('smartPanel.info.parsedTitle')}</dt><dd>{parsed.probableSeriesTitle ?? parsed.cleanTitle}</dd></div>
          <div><dt>{t('smartPanel.info.cleanSearchQuery')}</dt><dd>{parsed.cleanSearchQuery ?? '—'}</dd></div>
          {(parsed.versionTags?.length ?? 0) > 0 && (
            <div><dt>{t('smartPanel.info.versionTags')}</dt><dd>{parsed.versionTags!.join(', ')}</dd></div>
          )}
          {(parsed.technicalTags.length > 0 || (parsed.releaseGroupTags?.length ?? 0) > 0) && (
            <div><dt>{t('smartPanel.info.technicalTags')}</dt><dd>{[...parsed.technicalTags, ...(parsed.releaseGroupTags ?? [])].join(', ')}</dd></div>
          )}
          {parsed.releaseGroup && (
            <div><dt>{t('smartPanel.info.releaseGroup')}</dt><dd>{parsed.releaseGroup}</dd></div>
          )}
          <div><dt>{t('smartPanel.info.folder')}</dt><dd className="smart-panel__mono">{formatFolderLabelForDisplay(current.folderLabel ?? current.folder)}</dd></div>
          <div><dt>{t('smartPanel.info.path')}</dt><dd className="smart-panel__mono">{formatPathForDisplay(current.filePath)}</dd></div>
          {playbackHealth && (
            <div><dt>{t('smartPanel.info.playbackError')}</dt><dd>{playbackHealth.message}</dd></div>
          )}
          <div><dt>{t('smartPanel.info.ffmpeg')}</dt><dd>
            {ffmpeg == null ? '…' : ffmpeg.available ? `${t('smartPanel.info.ffmpegYes')}${ffmpeg.path ? ` (${ffmpeg.path})` : ''}` : t('smartPanel.info.ffmpegNo')}
          </dd></div>
          <div><dt>{t('smartPanel.info.thumbnail')}</dt><dd>{thumbnailStatusLabel(t, thumb)}</dd></div>
        </dl>
      )}
      <div className="smart-panel__actions">
        <button
          type="button"
          className="ghost-button"
          disabled={current.kind !== 'video' || thumb?.status === 'generating'}
          onClick={() => void retryThumbnailForItem(current)}
        >
          {t('smartPanel.info.retryThumbnail')}
        </button>
        <button type="button" className="ghost-button" disabled title={t('smartPanel.info.comingSoon')}>
          {t('smartPanel.info.editMetadata')}
        </button>
        <button type="button" className="ghost-button" onClick={props.onFavorite}>
          {current.favorite ? t('media.favorite.in') : t('media.favorite.add')}
        </button>
        <button type="button" className="ghost-button" onClick={() => void navigator.clipboard?.writeText(formatPathForCopy(current.filePath))}>
          {t('smartPanel.info.copyPath')}
        </button>
      </div>
    </div>
  );
});
