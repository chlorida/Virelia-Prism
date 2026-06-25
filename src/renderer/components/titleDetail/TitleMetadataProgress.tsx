import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useMetadataBusyElapsed } from '../../hooks/useTitleMetadataActivity';

interface TitleMetadataProgressProps {
  activity: 'search' | 'images';
  compact?: boolean;
}

export const TitleMetadataProgress = memo(function TitleMetadataProgress(props: TitleMetadataProgressProps) {
  const { t } = useI18n();
  const elapsed = useMetadataBusyElapsed(true);
  const phaseKey = props.activity === 'search'
    ? 'media.titles.metadata.refreshPhaseSearch'
    : 'media.titles.metadata.refreshPhaseImages';

  return (
    <div
      className={props.compact
        ? 'title-metadata-progress title-metadata-progress--compact'
        : 'title-metadata-progress'}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="title-metadata-progress__spinner" aria-hidden />
      <div className="title-metadata-progress__copy">
        <p className="title-metadata-progress__label">{t(phaseKey)}</p>
        {elapsed >= 5 && (
          <p className="title-metadata-progress__elapsed muted">
            {t('media.titles.metadata.refreshElapsed', { seconds: String(elapsed) })}
          </p>
        )}
        {!props.compact && elapsed >= 20 && (
          <p className="title-metadata-progress__hint muted">
            {t('media.titles.metadata.refreshHint')}
          </p>
        )}
      </div>
    </div>
  );
});
