import type { RelatedTitle } from '../../../shared/titleMetadataTypes';
import { useI18n } from '../../i18n/I18nProvider';
import { ModalAnimatedPresence } from '../AnimatedPresence';

interface RelatedTitlePreviewModalProps {
  open: boolean;
  item: RelatedTitle;
  onClose: () => void;
  onFindOnline?: () => void;
}

export function RelatedTitlePreviewModal(props: RelatedTitlePreviewModalProps) {
  const { t } = useI18n();
  const { item } = props;
  const cover = item.coverImage?.displayUrl ?? item.coverImage?.url;

  return (
    <ModalAnimatedPresence
      open={props.open}
      role="dialog"
      aria-modal="true"
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section className="related-preview-modal glass-inset">
        <header className="related-preview-modal__header">
          <h2>{item.title}</h2>
          <button type="button" className="ghost-button" onClick={props.onClose}>{t('settings.close')}</button>
        </header>
        <div className="related-preview-modal__body">
          {cover && <img src={cover} alt="" className="related-preview-modal__cover" />}
          <p className="muted">
            {[item.format, item.year, t(`media.titles.explore.${item.relationType}` as Parameters<typeof t>[0])]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="related-preview-modal__note">{t('media.titles.explore.notInLibrary')}</p>
          <div className="related-preview-modal__actions">
            {props.onFindOnline && (
              <button type="button" className="ghost-button" onClick={props.onFindOnline}>
                {t('media.franchise.findOnline')}
              </button>
            )}
            {item.externalUrl && (
              <a href={item.externalUrl} target="_blank" rel="noreferrer noopener" className="ghost-button">
                {t('media.titles.detail.externalLink')}
              </a>
            )}
          </div>
        </div>
      </section>
    </ModalAnimatedPresence>
  );
}
