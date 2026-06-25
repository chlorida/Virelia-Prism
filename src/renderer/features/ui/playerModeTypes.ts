export type PlayerMode = 'library' | 'player' | 'mini';

export type NormalPlayerMode = 'library' | 'player';

export interface PlayerModeState {
  mode: PlayerMode;
  /** Mode to restore when exiting mini. */
  returnMode: NormalPlayerMode;
  /** Focus/theater layout inside Player Mode (video). */
  videoTheater: boolean;
}
