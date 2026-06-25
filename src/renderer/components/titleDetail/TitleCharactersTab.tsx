import { memo } from 'react';
import type { CharacterMetadata } from '../../../shared/titleMetadataTypes';
import { useI18n } from '../../i18n/I18nProvider';

interface TitleCharactersTabProps {
  characters?: CharacterMetadata[];
}

export const TitleCharactersTab = memo(function TitleCharactersTab(props: TitleCharactersTabProps) {
  const { t } = useI18n();
  const characters = props.characters ?? [];
  if (characters.length === 0) return null;

  return (
    <section className="title-characters">
      <div className="title-characters__grid">
        {characters.map((character) => {
          const image = character.image?.displayUrl ?? character.image?.url;
          return (
            <article key={character.id} className="title-characters__card">
              <div className="title-characters__avatar">
                {image ? (
                  <img src={image} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="title-characters__avatar-fallback" aria-hidden />
                )}
              </div>
              <div className="title-characters__copy">
                <h3 className="title-characters__name">{character.name}</h3>
                {character.role && character.role !== 'unknown' && (
                  <span className="muted">{t(`media.titles.characters.role.${character.role}` as Parameters<typeof t>[0])}</span>
                )}
                {(character.voiceActors?.length ?? 0) > 0 && (
                  <p className="title-characters__va muted">
                    {t('media.titles.cast.voiceActors')}: {character.voiceActors!.map((v) => v.name).join(', ')}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
});
