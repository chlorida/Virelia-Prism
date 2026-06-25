import { describe, expect, it } from 'vitest';
import { detectLocaleFromTag, resolveUiLocale, translate } from './i18n';

describe('i18n', () => {
  it('detects russian system locales', () => {
    expect(detectLocaleFromTag('ru-RU')).toBe('ru');
    expect(detectLocaleFromTag('uk-UA')).toBe('ru');
    expect(detectLocaleFromTag('be_BY')).toBe('ru');
  });

  it('defaults to english for other locales', () => {
    expect(detectLocaleFromTag('en-US')).toBe('en');
    expect(detectLocaleFromTag('de-DE')).toBe('en');
  });

  it('respects explicit preference over system', () => {
    expect(resolveUiLocale('en', 'ru-RU')).toBe('en');
    expect(resolveUiLocale('ru', 'en-US')).toBe('ru');
    expect(resolveUiLocale('auto', 'ru-RU')).toBe('ru');
  });

  it('interpolates params', () => {
    expect(translate('en', 'toast.filesAdded', { count: 3 })).toBe('Files added: 3');
  });

  it('translates player transport chrome in russian', () => {
    const keys = [
      'player.play',
      'player.pause',
      'player.next',
      'player.mini',
      'settings.onboarding.title',
    ] as const;
    for (const key of keys) {
      expect(translate('ru', key)).not.toBe(translate('en', key));
    }
  });
});
