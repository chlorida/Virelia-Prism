import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { useI18n } from '../i18n/I18nProvider';
import { TITLE_ROW_HEIGHT, TitleTableRow } from './TitleTableRow';
import { TitleCinemaHero, pickFeaturedTitle } from './TitleCinemaHero';

interface VirtualTitleTableProps {
  titles: LibraryTitle[];
  selectedTitleId?: string;
  listScopeKey?: string;
  listHint?: string;
  emptyKind?: 'library' | 'search';
  loading?: boolean;
  onOpenTitle: (title: LibraryTitle) => void;
  onContinueTitle: (title: LibraryTitle) => void;
}

export const VirtualTitleTable = memo(function VirtualTitleTable(props: VirtualTitleTableProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const featured = useMemo(() => pickFeaturedTitle(props.titles), [props.titles]);

  const virtualizer = useVirtualizer({
    count: props.titles.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TITLE_ROW_HEIGHT,
    overscan: 3,
    getItemKey: (index) => props.titles[index]?.id ?? index,
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [props.titles.length, props.loading, props.listScopeKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [props.listScopeKey]);

  return (
    <div className="media-table virtual-media-table virtual-title-table title-cinema-table">
      <div className="title-cinema-table__header">
        <div>
          <p className="eyebrow">{t('media.viewMode.titles')}</p>
          <h3 className="title-cinema-table__heading">{t('media.titles.cinemaHeading')}</h3>
        </div>
        {props.listHint && !props.loading && (
          <p className="media-list-hint title-cinema-table__hint">{props.listHint}</p>
        )}
      </div>

      {!props.loading && featured && props.titles.length > 0 && (
        <TitleCinemaHero
          featured={featured}
          onOpen={props.onOpenTitle}
          onContinue={props.onContinueTitle}
        />
      )}

      {props.loading ? (
        <div className="media-loading-state" aria-busy="true">
          <p>{t('media.loading')}</p>
        </div>
      ) : props.titles.length === 0 ? (
        <div className="media-empty-state">
          <p>{props.emptyKind === 'search' ? t('media.empty.search') : t('media.empty.library')}</p>
        </div>
      ) : (
        <div ref={scrollRef} className="virtual-media-table__viewport title-cinema-table__viewport">
          <div className="virtual-media-table__spacer title-cinema-table__spacer" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const title = props.titles[virtualRow.index];
              if (!title) return null;
              return (
                <TitleTableRow
                  key={title.id}
                  title={title}
                  selected={props.selectedTitleId === title.id}
                  style={{
                    position: 'absolute',
                    top: virtualRow.start,
                    height: TITLE_ROW_HEIGHT,
                    left: 0,
                    right: 0,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                  onOpen={() => props.onOpenTitle(title)}
                  onContinue={() => props.onContinueTitle(title)}
                  onShowEpisodes={() => props.onOpenTitle(title)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
