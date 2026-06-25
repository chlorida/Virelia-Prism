import { memo, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import { formatDuration } from '../lib/search';
import { formatFolderLabelForDisplay } from '../lib/pathDisplay';
import { useI18n } from '../i18n/I18nProvider';
import { useMediaDisplay, useResolvedMediaTitle } from '../hooks/useResolvedMediaTitle';
import { usePlayback } from '../playback/usePlayback';
import { resolveVideoRowPlayAction } from '../lib/videoPrimaryAction';

export interface MediaTableRowProps {
  item: MediaItem;
  durationSeconds?: number;
  isActive: boolean;
  isPlaying: boolean;
  isFocused: boolean;
  isWatching?: boolean;
  style: React.CSSProperties;
  onPlay: (item: MediaItem, options?: { forceWatch?: boolean }) => void;
  onQueue: (item: MediaItem) => void;
  onFavorite: (item: MediaItem) => void;
  onFocusRow: (id: string | undefined) => void;
  onContextMenu: (event: React.MouseEvent, item: MediaItem) => void;
  playerMode?: import('../features/ui/playerModeTypes').PlayerMode;
}

export const MediaTableRow = memo(function MediaTableRow(props: MediaTableRowProps) {
  const { t } = useI18n();
  const { state } = usePlayback();
  const { item } = props;
  const displayTitle = useResolvedMediaTitle(item);
  const display = useMediaDisplay(item);
  const [hover, setHover] = useState(false);
  const isDemo = !item.filePath;
  const isVideo = item.kind === 'video';
  const duration = props.durationSeconds ?? item.durationSeconds;
  const folderDisplay = formatFolderLabelForDisplay(item.folder) || item.folderLabel || '';
  const progress = item.durationSeconds && item.resumePositionSeconds
    ? Math.min(100, Math.round((item.resumePositionSeconds / item.durationSeconds) * 100))
    : 0;
  const showProgress = progress > 4 && progress < 96;
  const isCurrent = props.isActive || props.isPlaying;
  const rowAction = isVideo
    ? resolveVideoRowPlayAction(item, {
        isCurrent,
        isPlaying: props.isPlaying,
        playbackStatus: state.playbackStatus,
        inWatchMode: props.playerMode === 'player',
      })
    : null;
  const primaryLabel = rowAction ? t(rowAction.labelKey) : t('player.play');
  const playFromRow = () => {
    if (rowAction?.kind === 'watching' || rowAction?.kind === 'focus') {
      props.onPlay(item, { forceWatch: true });
      return;
    }
    props.onPlay(item, isVideo ? { forceWatch: rowAction?.forceWatch ?? true } : undefined);
  };

  return (
    <article
      className={[
        'media-row',
        'virtual-media-row',
        isVideo ? 'media-row--video' : 'media-row--audio',
        props.isActive ? 'active' : '',
        props.isPlaying ? 'playing' : '',
        props.isFocused ? 'focused' : '',
        props.isWatching ? 'is-watching' : '',
        hover ? 'is-hover' : '',
        isDemo ? 'is-demo' : ''
      ].filter(Boolean).join(' ')}
      style={props.style}
      tabIndex={props.isFocused ? 0 : -1}
      onContextMenu={(event) => props.onContextMenu(event, item)}
      onDoubleClick={() => playFromRow()}
      onClick={() => props.onFocusRow(item.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {showProgress && (
        <div className="media-row__progress" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      <button
        type="button"
        className="media-row__play-hit"
        aria-label={primaryLabel}
        onClick={(event) => {
          event.stopPropagation();
          props.onFocusRow(item.id);
          playFromRow();
        }}
      >
        <span className={`kind-dot ${item.kind}`} />
        <span className="media-row__play-icon" aria-hidden>{rowAction?.kind === 'watching' ? '●' : '▶'}</span>
      </button>
      <button
        type="button"
        className="media-title media-row-title"
        onClick={(event) => {
          event.stopPropagation();
          props.onFocusRow(item.id);
          playFromRow();
        }}
      >
        <span className="media-title-copy">
          <strong className="media-row-title__main">{displayTitle}</strong>
          <small className="media-row-title__sub">
            {display.episodeLabel ? `Ep ${display.episodeLabel}` : display.subtitle ?? item.fileName}
          </small>
        </span>
      </button>
      <span className="muted truncate cell-folder media-row-folder">{folderDisplay}</span>
      <span className="pill-label cell-kind">{isVideo ? t('media.kind.video') : t('media.kind.audio')}</span>
      <span className="muted cell-time">{formatDuration(duration)}</span>
      <span className={`row-actions cell-actions media-row-actions${hover ? ' is-visible' : ''}`}>
        <button
          type="button"
          className="media-row__play-btn"
          aria-label={primaryLabel}
          disabled={rowAction?.disabled}
          onClick={(event) => {
            event.stopPropagation();
            playFromRow();
          }}
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          className={item.favorite ? 'icon-button is-active' : 'icon-button'}
          aria-label={item.favorite ? t('media.favorite.remove') : t('media.favorite.add')}
          onClick={(event) => {
            event.stopPropagation();
            props.onFavorite(item);
          }}
        >
          ♥
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('media.queue.add')}
          onClick={(event) => {
            event.stopPropagation();
            props.onQueue(item);
          }}
        >
          +
        </button>
      </span>
    </article>
  );
}, (prev, next) => (
  prev.item === next.item
  && prev.durationSeconds === next.durationSeconds
  && prev.isActive === next.isActive
  && prev.isPlaying === next.isPlaying
  && prev.isFocused === next.isFocused
  && prev.isWatching === next.isWatching
  && prev.style.top === next.style.top
  && prev.style.height === next.style.height
));
