import { describe, expect, it } from 'vitest';
import { MEDIA_ROW_HEIGHT } from './VirtualMediaTable';

describe('virtual media table layout', () => {
  it('row height matches CSS variable default', () => {
    expect(MEDIA_ROW_HEIGHT).toBe(88);
  });
});
