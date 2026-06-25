import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem, Playlist } from '../../shared/types';
import type { ContextMenuItem } from './ContextMenu';
import { ContextMenu } from './ContextMenu';
import { MediaTableRow } from './MediaTableRow';
import { useI18n } from '../i18n/I18nProvider';
import { libraryPerfRecordRenderCommit } from '../lib/libraryPerf';

export const MEDIA_ROW_HEIGHT = 88;
const ROW_HEIGHT = MEDIA_ROW_HEIGHT;

interface VirtualMediaTableProps {
  items: MediaItem[];
  durationById: Record<string, number>;
  selectedId?: string;
  playingId?: string;
  listScopeKey?: string;
  layoutVersion?: string;
  focusedId?: string;
  listHint?: string;
  emptyKind?: 'library' | 'search';
  loading?: boolean;
  playlists: Playlist[];
  onImportFolder?: () => void;
  onPlay: (item: MediaItem) => void;
  onQueue: (item: MediaItem) => void;
  onFavorite: (item: MediaItem) => void;
  onAddToPlaylist: (playlistId: string, item: MediaItem) => void;
  onFocusRow: (id: string | undefined) => void;
  playerMode?: import('../features/ui/playerModeTypes').PlayerMode;
}

export const VirtualMediaTable = memo(function VirtualMediaTable(props: VirtualMediaTableProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [contextItem, setContextItem] = useState<MediaItem | null>(null);

  const [scrollTick, setScrollTick] = useState(0);

  const virtualizer = useVirtualizer({
    count: props.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: props.items.length > 2000 ? 12 : 8,
    getItemKey: (index) => props.items[index]?.id ?? index
  });

  const scrollRangeLabel = useMemo(() => {
    void scrollTick;
    const virtualRows = virtualizer.getVirtualItems();
    if (props.items.length === 0 || virtualRows.length === 0) return '';
    const first = virtualRows[0]!.index + 1;
    const last = virtualRows[virtualRows.length - 1]!.index + 1;
    return t('media.list.scrollRange', {
      from: first.toLocaleString(),
      to: last.toLocaleString(),
      total: props.items.length.toLocaleString(),
    });
  }, [props.items.length, scrollTick, virtualizer, t]);

  useLayoutEffect(() => {
    virtualizer.measure();
    libraryPerfRecordRenderCommit(Math.min(props.items.length, virtualizer.getVirtualItems().length));
  }, [props.items.length, props.loading, props.listScopeKey, props.layoutVersion]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = 0;
  }, [props.listScopeKey]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      virtualizer.measure();
    });
    observer.observe(node);
    const onScroll = () => {
      virtualizer.measure();
      setScrollTick((tick) => tick + 1);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remeasure when layout changes
  }, [props.items.length, props.listScopeKey, props.loading, props.layoutVersion]);

  useEffect(() => {
    const onResize = () => virtualizer.measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- window resize remeasure
  }, []);

  useEffect(() => {
    if (!props.focusedId || !scrollRef.current) return;
    const index = props.items.findIndex((item) => item.id === props.focusedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll when keyboard focus changes only
  }, [props.focusedId]);

  const contextItems: ContextMenuItem[] = useMemo(() => [
    { id: 'play', label: t('media.context.play') },
    { id: 'queue', label: t('media.context.queue') },
    { id: 'favorite', label: t('media.context.favorite') },
    ...props.playlists
      .filter((playlist) => !playlist.smart)
      .map((playlist) => ({
        id: `playlist:${playlist.id}`,
        label: t('media.context.playlist', { name: playlist.name })
      }))
  ], [props.playlists, t]);

  const openContextMenu = useCallback((event: React.MouseEvent, item: MediaItem) => {
    event.preventDefault();
    setContextItem(item);
    setContextPos({ x: event.clientX, y: event.clientY });
    setContextOpen(true);
  }, []);

  function handleContextSelect(id: string) {
    if (!contextItem) return;
    if (id === 'play') props.onPlay(contextItem);
    if (id === 'queue') props.onQueue(contextItem);
    if (id === 'favorite') props.onFavorite(contextItem);
    if (id.startsWith('playlist:')) props.onAddToPlaylist(id.slice('playlist:'.length), contextItem);
  }

  return (
    <div className="media-table virtual-media-table">
      <div className="table-head table-head--sticky">
        <span aria-hidden />
        <span>{t('media.table.title')}</span>
        <span>{t('media.table.folder')}</span>
        <span>{t('media.table.kind')}</span>
        <span>{t('media.table.time')}</span>
        <span />
      </div>

      {props.listHint && !props.loading && <p className="media-list-hint">{props.listHint}</p>}
      {!props.loading && props.items.length > 100 && scrollRangeLabel && (
        <p className="media-list-hint media-list-hint--scroll-range">{scrollRangeLabel}</p>
      )}

      {props.loading ? (
        <div className="media-loading-state" aria-busy="true">
          <p>{t('media.loading')}</p>
        </div>
      ) : props.items.length === 0 ? (
        <div className="media-empty-state">
          <p>{props.emptyKind === 'search' ? t('media.empty.search') : t('media.empty.library')}</p>
          <small>
            {props.emptyKind === 'search' ? t('media.empty.searchHint') : t('media.empty.libraryHint')}
          </small>
          {props.emptyKind !== 'search' && props.onImportFolder && (
            <button type="button" className="primary-action" onClick={props.onImportFolder}>
              {t('library.importFolder')}
            </button>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="media-table__body virtual-media-table__viewport">
          <div className="virtual-media-table__spacer" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = props.items[virtualRow.index];
              if (!item) return null;
              return (
                <MediaTableRow
                  key={item.id}
                  item={item}
                  durationSeconds={props.durationById[item.id] ?? item.durationSeconds}
                  isActive={props.selectedId === item.id}
                  isPlaying={props.playingId === item.id}
                  isFocused={props.focusedId === item.id}
                  isWatching={props.playingId === item.id && item.kind === 'video' && props.playerMode === 'player'}
                  style={{ position: 'absolute', top: virtualRow.start, height: ROW_HEIGHT, left: 0, right: 0, width: '100%', boxSizing: 'border-box' }}
                  onPlay={props.onPlay}
                  onQueue={props.onQueue}
                  onFavorite={props.onFavorite}
                  onFocusRow={props.onFocusRow}
                  onContextMenu={openContextMenu}
                />
              );
            })}
          </div>
        </div>
      )}

      <ContextMenu
        open={contextOpen}
        x={contextPos.x}
        y={contextPos.y}
        items={contextItems}
        onSelect={handleContextSelect}
        onClose={() => setContextOpen(false)}
      />
    </div>
  );
});
