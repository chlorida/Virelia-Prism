import { memo, useEffect, useMemo } from 'react';

import type { LibraryTitle } from '../lib/mediaIntelligence/types';

import { listFranchises, buildFranchiseHubView, type FranchiseHubView } from '../lib/mediaIntelligence/franchise/franchiseService';
import { requestFranchiseArtworkPoster } from '../lib/mediaIntelligence/franchise/franchiseArtworkService';

import {

  formatFranchiseLibraryProgress,

  formatFranchiseTypeSummary,

} from '../lib/mediaIntelligence/libraryDisplayUtils';

import { useI18n } from '../i18n/I18nProvider';

import { FranchiseTitleCover } from './franchise/FranchiseTitleCover';



interface LibraryFranchisesRowProps {

  libraryTitles: LibraryTitle[];

  onOpenFranchise: (franchiseId: string) => void;

}



function countFranchiseLocalTitles(

  franchiseId: string,

  libraryTitles: LibraryTitle[],

  hub?: FranchiseHubView

): number {

  const ids = new Set<string>();

  for (const entry of hub?.titles ?? []) {

    if (entry.inLibrary && entry.localTitleId) ids.add(entry.localTitleId);

  }

  for (const title of libraryTitles) {

    if (title.franchiseId === franchiseId) ids.add(title.id);

  }

  return ids.size;

}



export const LibraryFranchisesRow = memo(function LibraryFranchisesRow(props: LibraryFranchisesRowProps) {

  const { t } = useI18n();

  const franchises = useMemo(() => listFranchises().map((franchise) => {

    const hub = buildFranchiseHubView(franchise.franchiseId, props.libraryTitles);

    const types = franchise.titles.map((title) => title.type);

    const localCount = countFranchiseLocalTitles(franchise.franchiseId, props.libraryTitles, hub);

    const total = franchise.titles.length;

    return {

      franchise,

      localCount,

      total,

      typeSummary: formatFranchiseTypeSummary(types),

      localTitle: props.libraryTitles.find((title) => title.franchiseId === franchise.franchiseId),

      progressText: formatFranchiseLibraryProgress(localCount, total, t),

    };

  }), [props.libraryTitles, t]);

  useEffect(() => {
    for (const entry of franchises) {
      if (!entry.franchise.posterUrl) {
        requestFranchiseArtworkPoster(entry.franchise.franchiseId, entry.franchise.franchiseName);
      }
    }
  }, [franchises]);

  return (

    <section className="library-browse-row library-browse-row--franchises">

      <h3 className="library-browse-row__heading">{t('media.library.franchisesSection')}</h3>

      {franchises.length === 0 ? (

        <div className="library-franchises-empty muted">

          <p>{t('media.library.emptyFranchises')}</p>

        </div>

      ) : (

        <div className="library-browse-row__cards library-browse-row__cards--franchise prism-stagger-rail">

          {franchises.map((entry) => (

            <article

              key={entry.franchise.franchiseId}

              className="library-franchise-card library-franchise-card--rich prism-stagger-item"

              role="button"

              tabIndex={0}

              aria-label={`${entry.franchise.franchiseName}. ${entry.progressText}`}

              onClick={() => props.onOpenFranchise(entry.franchise.franchiseId)}

              onKeyDown={(event) => {

                if (event.key === 'Enter' || event.key === ' ') {

                  event.preventDefault();

                  props.onOpenFranchise(entry.franchise.franchiseId);

                }

              }}

            >

              <div className="library-franchise-card__visual">

                <FranchiseTitleCover

                  title={entry.franchise.franchiseName}

                  mediaType="series"

                  posterUrl={entry.franchise.posterUrl}

                  artworkKey={entry.franchise.franchiseId}

                  searchTitle={entry.franchise.franchiseName}

                  preferCatalogArtwork

                  variant="banner"

                />

                <span className="library-franchise-card__label">{t('media.library.franchiseBadge')}</span>

              </div>

              <div className="library-franchise-card__copy">

                <strong className="library-franchise-card__title">{entry.franchise.franchiseName}</strong>

                <span className="library-franchise-card__progress">

                  {entry.progressText}

                </span>

                <span className="library-franchise-card__types muted">{entry.typeSummary}</span>
                <span className="library-franchise-card__cta muted">
                  {t('media.franchise.openHub')} →
                </span>

              </div>

            </article>

          ))}

        </div>

      )}

    </section>

  );

});

