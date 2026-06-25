import { describe, expect, it } from 'vitest';
import { getTranslationActionUi, subtitleFileName } from './subtitleTranslationUi';

describe('subtitleTranslationUi', () => {
  it('disables translate when backend is not configured', () => {
    const ui = getTranslationActionUi('disabled', false, true);
    expect(ui.canTranslate).toBe(false);
    expect(ui.disabledReasonKey).toBe('subtitles.translateDisabledBackend');
  });

  it('warns when mock backend is enabled', () => {
    const ui = getTranslationActionUi('mock', true, true);
    expect(ui.canTranslate).toBe(true);
    expect(ui.warningKey).toBe('subtitles.translateMockWarning');
  });

  it('enables translate for configured local HTTP backend', () => {
    const ui = getTranslationActionUi('local-http', true, true);
    expect(ui.canTranslate).toBe(true);
    expect(ui.warningKey).toBeUndefined();
    expect(ui.disabledReasonKey).toBeUndefined();
  });

  it('extracts subtitle file name from path', () => {
    expect(subtitleFileName('D:\\Anime\\Sotsu\\ep15.ru.ass')).toBe('ep15.ru.ass');
  });
});
