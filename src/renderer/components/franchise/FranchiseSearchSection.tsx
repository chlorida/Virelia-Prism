import { memo } from 'react';
import type { FranchiseSearchResult } from '../../lib/mediaIntelligence/franchise/franchiseService';
import { useI18n } from '../../i18n/I18nProvider';

interface FranchiseSearchSectionProps {
  results: FranchiseSearchResult[];
  onOpenFranchise: (franchiseId: string) => void;
}

export const FranchiseSearchSection = memo(function FranchiseSearchSection(props: FranchiseSearchSectionProps) {
  const { t } = useI18n();
  if (props.results.length === 0) return null;

  return (
    <section className="franchise-search-section" aria-label={t('media.franchise.searchSection')}>
      <h3 className="title-detail-deep__subheading">{t('media.franchise.searchSection')}</h3>
      <div className="franchise-search-section__list">
        {props.results.map((result) => (
          <button
            key={result.franchise.franchiseId}
            type="button"
            className="franchise-search-section__item"
            onClick={() => props.onOpenFranchise(result.franchise.franchiseId)}
          >
            <span className="franchise-search-section__name">{result.franchise.franchiseName}</span>
            <span className="franchise-search-section__meta muted">
              {t('media.franchise.localCount', {
                local: result.localMatchCount,
                total: result.franchise.titles.length,
              })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
});
