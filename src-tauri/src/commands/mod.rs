mod app;
mod identity;
mod library;
mod metadata;
mod perf;
mod settings_cmds;
mod setup;
mod subtitles;
mod thumbnails;

pub use app::{get_app_info, open_url};
pub use identity::{read_identity_cache, write_identity_cache};
pub use library::{
    clear_library_snapshot, get_library, get_library_boot_paths, import_media_paths,
    load_library_cached, remove_folder, save_library_snapshot, scan_folder, validate_media_path,
    watch_folders,
};
pub use metadata::{
    cache_metadata_image, delete_title_metadata, read_title_metadata, write_title_metadata,
};
pub use perf::{append_perf_log, read_perf_log};
pub use settings_cmds::{load_settings, save_settings};
pub use setup::{
    cancel_whisper_model_download, delete_whisper_model, download_whisper_model,
    run_first_run_setup_benchmark, SetupDownloadRegistry,
};
pub use subtitles::{
    cancel_subtitle_generation, clear_generated_subtitle_cache, discover_subtitles,
    extract_embedded_subtitle, generate_subtitles, get_ffmpeg_status, get_or_infer_character_color,
    get_subtitle_generation_availability, import_subtitle_for_video, list_whisper_models,
    probe_video_audio_streams, read_subtitle_file, refresh_subtitle_index_for_video,
    reset_character_color_override, set_character_color_override, translate_existing_subtitles,
    translate_subtitles_command,
};
pub use thumbnails::{get_thumbnail, retry_thumbnail};
