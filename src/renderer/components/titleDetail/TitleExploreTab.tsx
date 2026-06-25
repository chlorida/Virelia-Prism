import { memo, useMemo, useState } from 'react';

import type { RelatedTitle } from '../../../shared/titleMetadataTypes';

import type { LibraryTitle } from '../../lib/mediaIntelligence/types';

import type { FranchiseWatchOrderMode } from '../../lib/mediaIntelligence/franchise/franchiseCatalog';

import {

  buildFranchiseTitleContext,

  buildFindOnlineSearchUrl,

} from '../../lib/mediaIntelligence/franchise/franchiseService';

import {

  groupRelatedByType,

  matchRelatedTitlesToLibrary,

} from '../../lib/mediaIntelligence/metadata/relatedTitleMatcher';

import { openExternalUrl } from '../../lib/tauriCommands';

import { useI18n } from '../../i18n/I18nProvider';

import { RelatedTitlePreviewModal } from './RelatedTitlePreviewModal';

import { FranchiseOrderSwitcher, FranchiseTitleList } from '../franchise/FranchiseHubPanel';



interface TitleExploreTabProps {

  title: LibraryTitle;

  related?: RelatedTitle[];

  libraryTitles: LibraryTitle[];

  onOpenLocalTitle?: (titleId: string) => void;

  onOpenFranchise?: (franchiseId: string) => void;

}



function coverSrc(item: RelatedTitle): string | undefined {

  return item.coverImage?.displayUrl ?? item.coverImage?.url;

}



export const TitleExploreTab = memo(function TitleExploreTab(props: TitleExploreTabProps) {

  const { t } = useI18n();

  const [preview, setPreview] = useState<RelatedTitle | null>(null);

  const [orderMode, setOrderMode] = useState<FranchiseWatchOrderMode>('release');



  const franchiseContext = useMemo(

    () => buildFranchiseTitleContext(props.title, props.libraryTitles, orderMode),

    [props.title, props.libraryTitles, orderMode]

  );



  const matched = useMemo(

    () => matchRelatedTitlesToLibrary(props.related, props.libraryTitles),

    [props.related, props.libraryTitles]

  );



  const providerGroups = useMemo(() => groupRelatedByType(matched), [matched]);

  const hasFranchise = Boolean(franchiseContext);

  const hasProvider = providerGroups.length > 0;

  if (!hasFranchise && !hasProvider) return null;



  return (

    <section className="title-explore">

      {franchiseContext && (

        <section className="title-explore__franchise">

          <div className="title-explore__franchise-head">

            <div>

              <h3 className="title-detail-deep__subheading">{franchiseContext.franchise.franchiseName}</h3>

              <p className="muted">{t('media.franchise.exploreHint')}</p>

            </div>

            <div className="title-explore__franchise-actions">

              <FranchiseOrderSwitcher value={orderMode} onChange={setOrderMode} />

              {props.onOpenFranchise && (

                <button

                  type="button"

                  className="ghost-button"

                  onClick={() => props.onOpenFranchise?.(franchiseContext.franchise.franchiseId)}

                >

                  {t('media.franchise.openHub')}

                </button>

              )}

            </div>

          </div>



          <FranchiseTitleList
            heading={t('media.franchise.beforeThis')}
            franchiseId={franchiseContext.franchise.franchiseId}
            entries={franchiseContext.before}
            orderMode={orderMode}
            emptyLabel={t('media.franchise.noEarlierTitles')}
            onOpenLocalTitle={props.onOpenLocalTitle}
          />

          <FranchiseTitleList
            heading={t('media.franchise.afterThis')}
            franchiseId={franchiseContext.franchise.franchiseId}
            entries={franchiseContext.after}
            orderMode={orderMode}
            onOpenLocalTitle={props.onOpenLocalTitle}
          />

          <FranchiseTitleList
            heading={t('media.franchise.sameFranchise')}
            franchiseId={franchiseContext.franchise.franchiseId}
            entries={franchiseContext.sameFranchise}
            orderMode={orderMode}
            onOpenLocalTitle={props.onOpenLocalTitle}
          />

        </section>

      )}



      {hasProvider && (

        <section className="title-explore__provider">

          <h3 className="title-detail-deep__subheading">{t('media.franchise.providerRelated')}</h3>

          {providerGroups.map((group) => (

            <section key={group.type} className="title-explore__group">

              <h4 className="title-explore__group-label">

                {t(`media.titles.explore.${group.type}` as Parameters<typeof t>[0])}

              </h4>

              <div className="title-explore__grid">

                {group.items.map((item) => {

                  const src = coverSrc(item);

                  const clickable = item.inLibrary && item.localTitleId;

                  return (

                    <button

                      key={item.id}

                      type="button"

                      className="title-explore__card"

                      onClick={() => {

                        if (clickable && item.localTitleId) {

                          props.onOpenLocalTitle?.(item.localTitleId);

                          return;

                        }

                        setPreview(item);

                      }}

                    >

                      <div className="title-explore__cover">

                        {src ? (

                          <img src={src} alt="" loading="lazy" decoding="async" />

                        ) : (

                          <span className="title-explore__cover-fallback" aria-hidden />

                        )}

                      </div>

                      <div className="title-explore__copy">

                        <span className="title-explore__title">{item.title}</span>

                        {(item.format || item.year) && (

                          <span className="title-explore__meta muted">

                            {[item.format, item.year].filter(Boolean).join(' - ')}

                          </span>

                        )}

                        {item.inLibrary ? (

                          <span className="meta-chip meta-chip--compact">{t('media.titles.explore.inLibrary')}</span>

                        ) : (

                          <span className="title-explore__status title-explore__status--missing">

                            {t('media.titles.explore.notInLibrary')}

                          </span>

                        )}

                      </div>

                    </button>

                  );

                })}

              </div>

            </section>

          ))}

        </section>

      )}



      {preview && (
        <RelatedTitlePreviewModal
          open
          item={preview}
          onClose={() => setPreview(null)}

          onFindOnline={() => {

            void openExternalUrl(buildFindOnlineSearchUrl(preview.title));

            setPreview(null);

          }}

        />

      )}

    </section>

  );

});

