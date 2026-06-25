import { memo, useMemo, useState } from 'react';
import type { MediaItem, QueueItem } from '../../shared/types';
import { AnimatedListItem } from './AnimatedListItem';
import { formatDuration } from '../lib/search';
import { reorderQueueById } from '../lib/playbackNavigation';
import { useI18n } from '../i18n/I18nProvider';
import { resolveMediaDisplayTitle } from '../lib/displayTitle';
import { useMediaDisplayLanguage } from '../hooks/useMediaDisplayLanguage';

type SideTab = 'queue' | 'history';

interface QueuePanelProps {
  presentation?: 'docked' | 'drawer';
  queue: QueueItem[];
  history: MediaItem[];
  mediaById: Map<string, MediaItem>;
  currentId?: string;
  onPlay: (item: MediaItem) => void;
  onRemove: (queueId: string) => void;
  onClear: () => void;
  onReorder: (queue: QueueItem[]) => void;
  onTogglePin: (queueId: string) => void;
}

export const QueuePanel = memo(function QueuePanel(props: QueuePanelProps) {
  const { t } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const [tab, setTab] = useState<SideTab>('queue');
  const [dragQueueId, setDragQueueId] = useState<string | null>(null);

  const queueEntries = useMemo(
    () => props.queue.map((queueItem) => ({
      queueItem,
      media: props.mediaById.get(queueItem.mediaId)
    })),
    [props.queue, props.mediaById]
  );

  function handleDrop(targetQueueId: string) {
    if (!dragQueueId || dragQueueId === targetQueueId) return;
    props.onReorder(reorderQueueById(props.queue, dragQueueId, targetQueueId));
    setDragQueueId(null);
  }

  const presentationClass = props.presentation === 'drawer' ? ' queue-panel--drawer' : ' queue-panel--docked';

  return (
    <aside
      className={`queue-panel${presentationClass}${queueEntries.length === 0 && tab === 'queue' ? ' queue-panel--empty' : ''}`}
    >
      <div className="queue-header">
        <div className="side-tabs">
          <button
            type="button"
            className={tab === 'queue' ? 'side-tab active' : 'side-tab'}
            onClick={() => setTab('queue')}
          >
            {t('queue.tab.queue')}
          </button>
          <button
            type="button"
            className={tab === 'history' ? 'side-tab active' : 'side-tab'}
            onClick={() => setTab('history')}
          >
            {t('queue.tab.history')}
          </button>
        </div>
        {tab === 'queue' && (
          <button
            type="button"
            className="ghost-button"
            disabled={queueEntries.length === 0}
            onClick={props.onClear}
          >
            {t('queue.clear')}
          </button>
        )}
      </div>

      {tab === 'queue' ? (
        <div className="queue-stack">
          {queueEntries.length === 0 && (
            <div className="queue-empty-state queue-empty-state--compact">
              <span className="queue-empty-state__icon" aria-hidden>♪</span>
              <p>{t('queue.empty.title')}</p>
              <small>{t('queue.empty.hint')}</small>
            </div>
          )}
          {queueEntries.map(({ queueItem, media }, index) => (
            <AnimatedListItem key={queueItem.id} itemKey={queueItem.id}>
            <article
              className={media && props.currentId === media.id ? 'queue-item active' : 'queue-item queue-item--orphan'}
              draggable={Boolean(media)}
              onDragStart={() => setDragQueueId(queueItem.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(queueItem.id)}
              onDragEnd={() => setDragQueueId(null)}
            >
              {media ? (
                <>
                  <button type="button" className="queue-item__main" onClick={() => props.onPlay(media)}>
                    <span className="queue-index">{queueItem.pinned ? '📌' : String(index + 1).padStart(2, '0')}</span>
                    <span className="queue-item__copy">
                      <strong>{resolveMediaDisplayTitle(media, { language: mediaLang })}</strong>
                      <small>{formatDuration(media.durationSeconds)} · {media.kind === 'video' ? t('media.kind.video') : t('media.kind.audio')}</small>
                    </span>
                  </button>
                  <span className="queue-item__actions">
                    <button
                      type="button"
                      className={queueItem.pinned ? 'icon-button is-active' : 'icon-button'}
                      aria-label={queueItem.pinned ? t('queue.unpin') : t('queue.pin')}
                      title={queueItem.pinned ? t('queue.unpin') : t('queue.pin')}
                      onClick={() => props.onTogglePin(queueItem.id)}
                    >
                      📌
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('queue.remove')}
                      title={t('queue.remove')}
                      onClick={() => props.onRemove(queueItem.id)}
                    >
                      ×
                    </button>
                  </span>
                </>
              ) : (
                <span className="queue-item__copy queue-item__copy--missing">
                  <strong>{t('queue.missing.title')}</strong>
                  <small>{t('queue.missing.hint')}</small>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('queue.remove')}
                    onClick={() => props.onRemove(queueItem.id)}
                  >
                    ×
                  </button>
                </span>
              )}
            </article>
            </AnimatedListItem>
          ))}
        </div>
      ) : (
        <div className="queue-stack">
          {props.history.length === 0 && (
            <div className="queue-empty-state">
              <span className="queue-empty-state__icon" aria-hidden>↺</span>
              <p>{t('queue.history.empty.title')}</p>
              <small>{t('queue.history.empty.hint')}</small>
            </div>
          )}
          {props.history.map((media) => (
            <article
              key={media.id}
              className={props.currentId === media.id ? 'queue-item active' : 'queue-item'}
            >
              <button type="button" className="queue-item__main" onClick={() => props.onPlay(media)}>
                <span className="queue-index">↺</span>
                <span className="queue-item__copy">
                  <strong>{resolveMediaDisplayTitle(media, { language: mediaLang })}</strong>
                  <small>{formatDuration(media.durationSeconds)} · {media.kind === 'video' ? t('media.kind.video') : t('media.kind.audio')}</small>
                </span>
              </button>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
});
