/**
 * Subtitle pipeline roadmap — audit notes only, no runtime behavior.
 *
 * Existing infrastructure:
 * - subtitle_discovery.rs (external .srt/.ass/.vtt next to video)
 * - subtitle_match.rs, subtitle_index.rs
 * - subtitle_generation_pipeline.rs (background generation hook)
 * - renderer: subtitleStore, useVideoSubtitles, subtitleSelection
 *
 * TODO (future phases):
 * 1. External subtitles — extend discovery metadata on MediaItem (paths, languages).
 * 2. Embedded tracks — expose ffprobe/mpv track list as SubtitleTrack[] without blocking UI.
 * 3. Generation — ffmpeg audio extract → local Whisper/faster-whisper → SRT/VTT/ASS cache.
 * 4. UI — choose original vs generated, output language, per-title subtitle preferences.
 * 5. Cache — key by media id + mtime + model version; cancel in-flight jobs on track change.
 */

export const SUBTITLE_ROADMAP_VERSION = 1;
