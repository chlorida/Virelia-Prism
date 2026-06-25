mod commands;
mod models;
mod services;
mod settings;
mod state;

use tauri::Manager;

use commands::{
    append_perf_log, cache_metadata_image, cancel_subtitle_generation,
    cancel_whisper_model_download, clear_generated_subtitle_cache, clear_library_snapshot,
    delete_title_metadata, delete_whisper_model, discover_subtitles, download_whisper_model, extract_embedded_subtitle,
    generate_subtitles, get_app_info, get_ffmpeg_status, get_library, get_library_boot_paths,
    get_or_infer_character_color, get_subtitle_generation_availability, get_thumbnail,
    import_media_paths, import_subtitle_for_video, list_whisper_models, load_library_cached,
    load_settings, open_url, probe_video_audio_streams, read_identity_cache, read_perf_log,
    read_subtitle_file, read_title_metadata, refresh_subtitle_index_for_video, remove_folder,
    reset_character_color_override, retry_thumbnail, run_first_run_setup_benchmark,
    save_library_snapshot, save_settings, scan_folder, set_character_color_override,
    translate_existing_subtitles, translate_subtitles_command, validate_media_path, watch_folders,
    write_identity_cache, write_title_metadata, SetupDownloadRegistry,
};
use services::builtin_translation::BuiltinTranslationRuntime;
use services::subtitle_generation::GenerationRegistry;
use state::library_disk_cache;
use state::{LibraryStore, SubtitleIndexStore};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(LibraryStore::default())
        .manage(SubtitleIndexStore::default())
        .manage(GenerationRegistry::default())
        .manage(BuiltinTranslationRuntime::default())
        .manage(SetupDownloadRegistry::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = SubtitleIndexStore::load_from_disk(app.handle());
            let settings = settings::load(app.handle())?;
            let translation_config =
                crate::services::subtitle_translation::load_translation_config(&settings);
            if translation_config.backend
                == crate::services::subtitle_translation::TranslationBackendKind::Builtin
            {
                let app_handle = app.handle().clone();
                let resource_dir = app.path().resource_dir().ok();
                let app_data = crate::state::subtitle_index::app_data_dir(app.handle()).ok();
                std::thread::spawn(move || {
                    let runtime = app_handle.state::<BuiltinTranslationRuntime>();
                    if let Err(err) = crate::services::builtin_translation::ensure_builtin_translation_server(
                        &runtime,
                        resource_dir.as_deref(),
                        app_data.as_deref(),
                    ) {
                        eprintln!("[Virelia translation] Built-in server not started: {err}");
                    }
                });
            }
            let store = app.state::<LibraryStore>();
            let folders: Vec<String> = settings
                .get("libraryFolders")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            if !folders.is_empty() {
                if let Ok(Some(snapshot)) =
                    library_disk_cache::load_library_disk_cache(app.handle(), &folders)
                {
                    store.hydrate_from_cache(
                        &snapshot.folders,
                        snapshot.media,
                        snapshot.scanned_at,
                    );
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            open_url,
            load_settings,
            save_settings,
            scan_folder,
            get_library,
            load_library_cached,
            get_library_boot_paths,
            save_library_snapshot,
            clear_library_snapshot,
            validate_media_path,
            import_media_paths,
            remove_folder,
            watch_folders,
            append_perf_log,
            read_perf_log,
            discover_subtitles,
            get_ffmpeg_status,
            get_subtitle_generation_availability,
            list_whisper_models,
            run_first_run_setup_benchmark,
            download_whisper_model,
            cancel_whisper_model_download,
            delete_whisper_model,
            extract_embedded_subtitle,
            generate_subtitles,
            translate_subtitles_command,
            translate_existing_subtitles,
            get_or_infer_character_color,
            set_character_color_override,
            reset_character_color_override,
            cancel_subtitle_generation,
            clear_generated_subtitle_cache,
            refresh_subtitle_index_for_video,
            read_subtitle_file,
            probe_video_audio_streams,
            import_subtitle_for_video,
            read_title_metadata,
            write_title_metadata,
            delete_title_metadata,
            cache_metadata_image,
            get_thumbnail,
            retry_thumbnail,
            read_identity_cache,
            write_identity_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Virelia Prism");
}
