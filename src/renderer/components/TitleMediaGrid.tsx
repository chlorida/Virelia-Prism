import { useVirtualizer } from '@tanstack/react-virtual';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { LibraryTitle } from '../lib/mediaIntelligence/types';

import type { ContentMode } from '../features/content/contentModeTypes';

import { PrismLoadingSpinner } from './PrismLoadingSpinner';

import { useI18n } from '../i18n/I18nProvider';

import { getTitleProgressSummary } from '../lib/mediaIntelligence/titlePlaybackService';

import { pickContinueTitle } from '../lib/mediaIntelligence/titleShelfUtils';

import { readStored, writeStored } from '../lib/storageKeys';

import { auditScrollContainer } from '../lib/devScrollAudit';

import { TitleContinueStrip } from './TitleContinueStrip';

import { TitleMediaCard } from './TitleMediaCard';

import { TitleMediaCompactRow } from './TitleMediaCompactRow';

import { ensureTitleMetadataHydrated, prefetchTitleMetadataBatch, requestTitleMetadata } from '../lib/mediaIntelligence/metadata/titleMetadataService';



type VideoShelfFilter = 'all' | 'series' | 'movie' | 'special' | 'continue';

type MusicShelfFilter = 'all' | 'continue';

type TitleShelfFilter = VideoShelfFilter | MusicShelfFilter;

type TitleShelfDensity = 'cards' | 'compact';



const CARD_MIN_WIDTH = 170;

const GRID_GAP = 16;

const CARD_ROW_HEIGHT = 300;

const COMPACT_ROW_HEIGHT = 68;

const VIRTUALIZE_THRESHOLD = 48;

const TITLES_SCROLL_SELECTOR = '.media-workspace__list--titles-browse';



function filterVideoTitles(titles: LibraryTitle[], filter: VideoShelfFilter): LibraryTitle[] {

  if (filter === 'continue') {

    return titles.filter((title) => getTitleProgressSummary(title).hasProgress);

  }

  if (filter === 'series') return titles.filter((title) => title.mediaType === 'series');

  if (filter === 'movie') return titles.filter((title) => title.mediaType === 'movie');

  if (filter === 'special') {

    return titles.filter((title) => title.mediaType === 'ova' || title.mediaType === 'special');

  }

  return titles;

}



function filterMusicTitles(titles: LibraryTitle[], filter: MusicShelfFilter): LibraryTitle[] {

  if (filter === 'continue') {

    return titles.filter((title) => getTitleProgressSummary(title).hasProgress);

  }

  return titles;

}



/** Dev-only: duplicate titles to stress-test scroll (localStorage prismDevScrollTest=1). */

function withDevScrollTestTitles(titles: LibraryTitle[]): LibraryTitle[] {

  if (!import.meta.env.DEV || localStorage.getItem('prismDevScrollTest') !== '1' || titles.length === 0) {

    return titles;

  }

  const copies: LibraryTitle[] = [];

  for (let i = 0; i < 36; i += 1) {

    const source = titles[i % titles.length];

    copies.push({ ...source, id: `dev-scroll-${i}-${source.id}` });

  }

  return copies;

}



interface TitleMediaGridProps {

  titles: LibraryTitle[];

  contentMode?: ContentMode;

  excludeTitleIds?: Set<string>;

  selectedTitleId?: string;

  playingId?: string;

  listScopeKey?: string;

  listHint?: string;

  emptyKind?: 'library' | 'search';

  loading?: boolean;

  onImportFolder?: () => void;

  onOpenPlayer?: () => void;

  onOpenTitle: (title: LibraryTitle) => void;

  onContinueTitle: (title: LibraryTitle) => void;

  onTitleContextMenu?: (event: React.MouseEvent, title: LibraryTitle) => void;

}



export const TitleMediaGrid = memo(function TitleMediaGrid(props: TitleMediaGridProps) {

  const { t } = useI18n();

  const contentMode = props.contentMode ?? 'video';

  const isMusicMode = contentMode === 'music';

  const continueTitle = useMemo(() => pickContinueTitle(props.titles), [props.titles]);

  const [filter, setFilter] = useState<TitleShelfFilter>('all');

  const [density, setDensity] = useState<TitleShelfDensity>(() =>

    readStored<TitleShelfDensity>('titleShelfDensity', 'cards')

  );

  const compact = density === 'compact';

  const gridRef = useRef<HTMLDivElement>(null);

  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  const [columnCount, setColumnCount] = useState(4);



  useEffect(() => {

    setFilter('all');

  }, [contentMode]);



  useEffect(() => {

    const resolveScrollOwner = () => document.querySelector<HTMLElement>(TITLES_SCROLL_SELECTOR);

    setScrollElement(resolveScrollOwner());

    const observer = new MutationObserver(() => {

      setScrollElement((current) => current ?? resolveScrollOwner());

    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();

  }, [props.listScopeKey]);



  const filtered = useMemo(() => {

    if (isMusicMode) {

      return filterMusicTitles(props.titles, filter as MusicShelfFilter);

    }

    return filterVideoTitles(props.titles, filter as VideoShelfFilter);

  }, [props.titles, filter, isMusicMode]);



  const gridTitles = useMemo(() => {

    let rows = filtered;

    if (continueTitle && filter === 'all') {

      rows = filtered.filter((title) => title.id !== continueTitle.id);

    }

    if (props.excludeTitleIds && props.excludeTitleIds.size > 0 && filter === 'all' && !isMusicMode) {

      rows = rows.filter((title) => !props.excludeTitleIds!.has(title.id));

    }

    return withDevScrollTestTitles(rows);

  }, [filtered, continueTitle, filter, props.excludeTitleIds, isMusicMode]);



  const useVirtualization = gridTitles.length >= VIRTUALIZE_THRESHOLD;
  const shouldVirtualize = useVirtualization && scrollElement != null;



  useLayoutEffect(() => {

    const el = gridRef.current;

    if (!el || compact) return;

    const measure = () => {

      const width = el.clientWidth || 800;

      setColumnCount(Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))));

    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(el);

    return () => observer.disconnect();

  }, [compact, gridTitles.length, filter, density]);



  const rowCount = compact

    ? gridTitles.length

    : Math.max(1, Math.ceil(gridTitles.length / Math.max(1, columnCount)));



  const virtualizer = useVirtualizer({

    count: shouldVirtualize ? rowCount : 0,

    getScrollElement: () => scrollElement,

    estimateSize: () => (compact ? COMPACT_ROW_HEIGHT : CARD_ROW_HEIGHT),

    overscan: compact ? 8 : 3,

    getItemKey: (index) => {

      if (compact) return gridTitles[index]?.id ?? index;

      const first = gridTitles[index * columnCount];

      return first?.id ?? index;

    },

  });



  useLayoutEffect(() => {

    if (!shouldVirtualize) return;

    virtualizer.measure();

  }, [gridTitles.length, columnCount, compact, filter, density, props.listScopeKey, shouldVirtualize]);



  useEffect(() => {

    if (!continueTitle) return;

    void ensureTitleMetadataHydrated(continueTitle).then((record) => {

      if (record.state === 'metadataReady' || record.state === 'metadataNeedsReview') return;

      if (!isMusicMode) requestTitleMetadata(continueTitle, 'critical');

    });

  }, [continueTitle?.id, isMusicMode]);



  useEffect(() => {

    if (gridTitles.length === 0 || isMusicMode) return;

    const visibleTitles = shouldVirtualize

      ? virtualizer.getVirtualItems().flatMap((row) => {

        if (compact) {

          const title = gridTitles[row.index];

          return title ? [title] : [];

        }

        const start = row.index * columnCount;

        return gridTitles.slice(start, start + columnCount);

      })

      : gridTitles.slice(0, 12);



    if (visibleTitles.length === 0) return;



    const run = () => {

      void prefetchTitleMetadataBatch(visibleTitles, 'normal', 12);

    };

    if (typeof requestIdleCallback === 'function') {

      requestIdleCallback(run, { timeout: 6000 });

    } else {

      globalThis.setTimeout(run, 250);

    }

  }, [gridTitles, isMusicMode, shouldVirtualize, virtualizer.range?.startIndex, virtualizer.range?.endIndex, columnCount, compact]);



  useEffect(() => {

    const scrollOwner = document.querySelector<HTMLElement>(TITLES_SCROLL_SELECTOR);

    auditScrollContainer(scrollOwner, 'center-scroll-owner (titles browse)');

    auditScrollContainer(

      document.querySelector<HTMLElement>('.title-media-grid__cards'),

      'collection grid (flow, no inner scroll)'

    );

  }, [gridTitles.length, filter, density, props.loading]);



  const filters = isMusicMode

    ? [

      { id: 'all' as const, label: t('media.titles.filter.all') },

      { id: 'continue' as const, label: t('media.titles.filter.continue') },

    ]

    : [

      { id: 'all' as const, label: t('media.titles.filter.all') },

      { id: 'series' as const, label: t('media.titles.filter.series') },

      { id: 'movie' as const, label: t('media.titles.filter.movies') },

      { id: 'special' as const, label: t('media.titles.filter.specials') },

      { id: 'continue' as const, label: t('media.titles.filter.continue') },

    ];



  const sectionHeading = isMusicMode

    ? t('media.library.musicSection')

    : t('media.library.localTitlesSection');



  const continueHeading = isMusicMode

    ? t('media.library.continueListening')

    : t('media.library.continueSection');



  const renderTitleCard = (title: LibraryTitle) => (

    compact ? (

      <TitleMediaCompactRow

        key={title.id}

        title={title}

        playingId={props.playingId}

        selected={props.selectedTitleId === title.id}

        onOpen={() => props.onOpenTitle(title)}

        onContinue={() => props.onContinueTitle(title)}

        onShowEpisodes={() => props.onOpenTitle(title)}

        onContextMenu={props.onTitleContextMenu
          ? (event) => props.onTitleContextMenu?.(event, title)
          : undefined}

      />

    ) : (

      <TitleMediaCard

        key={title.id}

        title={title}

        playingId={props.playingId}

        selected={props.selectedTitleId === title.id}

        onOpen={() => props.onOpenTitle(title)}

        onContinue={() => props.onContinueTitle(title)}

        onShowEpisodes={() => props.onOpenTitle(title)}

        onContextMenu={props.onTitleContextMenu
          ? (event) => props.onTitleContextMenu?.(event, title)
          : undefined}

      />

    )

  );



  const renderVirtualRows = () => (

    <div

      className="title-media-grid__virtual-spacer"

      style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}

    >

      {virtualizer.getVirtualItems().map((virtualRow) => {

        if (compact) {

          const title = gridTitles[virtualRow.index];

          if (!title) return null;

          return (

            <div

              key={title.id}

              className="title-media-grid__virtual-row title-media-grid__virtual-row--compact"

              style={{

                position: 'absolute',

                top: virtualRow.start,

                left: 0,

                right: 0,

                height: virtualRow.size,

              }}

            >

              {renderTitleCard(title)}

            </div>

          );

        }



        const start = virtualRow.index * columnCount;

        const rowTitles = gridTitles.slice(start, start + columnCount);

        return (

          <div

            key={`row-${virtualRow.index}-${rowTitles[0]?.id ?? 'empty'}`}

            className="title-media-grid__virtual-row title-media-grid__cards title-media-grid__cards--virtual-row"

            style={{

              position: 'absolute',

              top: virtualRow.start,

              left: 0,

              right: 0,

              height: virtualRow.size,

            }}

          >

            {rowTitles.map((title) => renderTitleCard(title))}

          </div>

        );

      })}

    </div>

  );



  const renderAllTitles = () => (

    <div

      className={compact

        ? 'title-media-grid__cards title-media-grid__cards--compact'

        : 'title-media-grid__cards'}

      key={`${props.listScopeKey}-${contentMode}-${filter}-${density}`}

    >

      {gridTitles.map((title) => (

        <div key={title.id} className={shouldVirtualize ? undefined : 'prism-stagger-item'}>

          {renderTitleCard(title)}

        </div>

      ))}

    </div>

  );



  return (

    <div className={['title-media-grid', isMusicMode ? 'title-media-grid--music' : ''].filter(Boolean).join(' ')}>

      {!props.loading && continueTitle && filter === 'all' && (

        <section className="library-browse-row library-browse-row--continue">

          <h3 className="library-section-heading">{continueHeading}</h3>

          <TitleContinueStrip

            variant={isMusicMode ? 'music' : 'video'}

            title={continueTitle}

            onOpen={props.onOpenTitle}

            onContinue={props.onContinueTitle}

            onOpenPlayer={props.onOpenPlayer}

          />

        </section>

      )}



      <div className="title-media-grid__controls">

        <div className="title-media-grid__heading-row">

          <h3 className="library-section-heading">{sectionHeading}</h3>

        </div>

        <div className="title-media-grid__toolbar">

          <div className="title-media-grid__filters" role="group" aria-label={t('media.titles.filter.label')}>

            {filters.map((chip) => (

              <button

                key={chip.id}

                type="button"

                className={[

                  'title-media-grid__chip shell-segment',

                  filter === chip.id ? 'is-active' : '',

                ].filter(Boolean).join(' ')}

                aria-pressed={filter === chip.id}

                onClick={() => setFilter(chip.id)}

              >

                {chip.label}

              </button>

            ))}

          </div>

          <div className="title-media-grid__density" role="group" aria-label={t('media.titles.density.label')}>

            {props.listHint && (

              <p className="title-media-grid__count muted">{props.listHint}</p>

            )}

            <button

              type="button"

              className={[

                'title-media-grid__chip shell-segment',

                density === 'cards' ? 'is-active' : '',

              ].filter(Boolean).join(' ')}

              aria-pressed={density === 'cards'}

              onClick={() => {

                setDensity('cards');

                writeStored('titleShelfDensity', 'cards');

              }}

            >

              {t('media.titles.density.cards')}

            </button>

            <button

              type="button"

              className={[

                'title-media-grid__chip shell-segment',

                density === 'compact' ? 'is-active' : '',

              ].filter(Boolean).join(' ')}

              aria-pressed={density === 'compact'}

              onClick={() => {

                setDensity('compact');

                writeStored('titleShelfDensity', 'compact');

              }}

            >

              {t('media.titles.density.compact')}

            </button>

          </div>

        </div>

      </div>



      {props.loading ? (

        <PrismLoadingSpinner label={t('media.loading')} />

      ) : gridTitles.length === 0 ? (

        <div className="media-empty-state media-empty-state--library">

          <p>{props.emptyKind === 'search' ? t('media.empty.search') : t('media.empty.library')}</p>

          <p className="muted">

            {isMusicMode

              ? t('media.empty.musicHint')

              : props.emptyKind === 'search'

                ? t('media.empty.searchHint')

                : t('media.empty.libraryHint')}

          </p>

          {props.emptyKind !== 'search' && props.onImportFolder && (

            <div className="media-empty-state__actions">

              <button type="button" className="primary-action" onClick={props.onImportFolder}>

                {t('media.search.importFolder')}

              </button>

            </div>

          )}

        </div>

      ) : (

        <div ref={gridRef} className="title-media-grid__viewport">

          {shouldVirtualize ? renderVirtualRows() : renderAllTitles()}

        </div>

      )}



    </div>

  );

});


