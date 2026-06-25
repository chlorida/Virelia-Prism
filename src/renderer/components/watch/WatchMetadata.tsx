import { memo, useState } from 'react';
import type { MediaItem } from '../../../shared/types';
import { parseDisplayTitleFromItem } from '../../lib/displayTitle';
import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDuration } from '../../lib/search';
import { formatFolderLabelForDisplay, formatPathForDisplay } from '../../lib/pathDisplay';
import { IconButton } from '../player/IconButton';

interface WatchMetadataProps {
  track: MediaItem;
  engineLabel: string;
  theater?: boolean;
  onFavorite: () => void;
  onQueue: () => void;
  onPlayNext: () => void;
}

export const WatchMetadata = memo(function WatchMetadata(props: WatchMetadataProps) {
  const { t } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const { track } = props;
  const display = parseDisplayTitleFromItem(track, mediaLang);
  const folder = formatFolderLabelForDisplay(track.folderLabel ?? track.folder);
  const displayPath = formatPathForDisplay(track.filePath);
  const progress = track.durationSeconds && track.resumePositionSeconds
    ? Math.round((track.resumePositionSeconds / track.durationSeconds) * 100)
    : 0;
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className={`watch-metadata${props.theater ? ' watch-metadata--theater' : ''}`}>
      <div className="watch-metadata__badges">
        <span className="watch-badge">{t('media.kind.video')}</span>
        <span className="watch-badge watch-badge--muted">{props.engineLabel}</span>
        {track.durationSeconds ? (
          <span className="watch-badge watch-badge--muted">{formatDuration(track.durationSeconds)}</span>
        ) : null}
        {display.chips.map((chip) => (
          <span key={chip} className="watch-badge watch-badge--chip">{chip}</span>
        ))}
        {progress > 5 && progress < 95 ? (
          <span className="watch-badge watch-badge--progress">{progress}% {t('smartPanel.watched')}</span>
        ) : null}
      </div>
      <h2 className="watch-metadata__title" title={display.title}>{display.title}</h2>
      {folder && (
        <p className="watch-metadata__path" title={displayPath || folder}>{folder}</p>
      )}
      <div className="watch-metadata__actions watch-metadata__actions--icons">
        <IconButton
          label={track.favorite ? t('media.favorite.in') : t('media.favorite.add')}
          active={track.favorite}
          onClick={() => props.onFavorite()}
        >
          <span aria-hidden>{track.favorite ? '♥' : '♡'}</span>
        </IconButton>
        <IconButton label={t('media.queue.add')} onClick={() => props.onQueue()}>
          <span aria-hidden>+</span>
        </IconButton>
        <IconButton label={t('smartPanel.playNext')} onClick={() => props.onPlayNext()}>
          <span aria-hidden>⏭</span>
        </IconButton>
        <IconButton label={t('watch.more')} onClick={() => setMoreOpen((v) => !v)}>
          <span aria-hidden>⋯</span>
        </IconButton>
      </div>
      {moreOpen && track.filePath && (
        <p className="watch-metadata__file" title={displayPath}>{track.fileName}</p>
      )}
    </div>
  );
});
