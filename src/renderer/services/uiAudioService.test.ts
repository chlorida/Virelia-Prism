import { describe, expect, it } from 'vitest';
import { UI_SOUND_CATEGORY_BY_ID, UI_IMPORTANT_DURING_PLAYBACK } from '../../shared/uiAudioTypes';
import { defaultUiSoundsSettings } from '../../shared/uiAudioTypes';
import { configureUiAudio, uiAudioService } from './uiAudioService';

describe('uiAudioService', () => {
  it('maps sounds to categories', () => {
    expect(UI_SOUND_CATEGORY_BY_ID.play).toBe('playback');
    expect(UI_SOUND_CATEGORY_BY_ID.open).toBe('navigation');
    expect(UI_SOUND_CATEGORY_BY_ID.queue_add).toBe('queue');
  });

  it('marks important playback sounds', () => {
    expect(UI_IMPORTANT_DURING_PLAYBACK.has('play')).toBe(true);
    expect(UI_IMPORTANT_DURING_PLAYBACK.has('tab')).toBe(false);
  });

  it('accepts settings configuration without throwing', () => {
    configureUiAudio({ ...defaultUiSoundsSettings(), enabled: false });
    expect(() => uiAudioService.playUiSound('tab')).not.toThrow();
  });
});
