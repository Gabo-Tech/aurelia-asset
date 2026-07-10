mod commands;

use commands::{
    ai_chat, ai_status, download_model, is_native_desktop, pick_model_path, read_import_file,
    save_export_file, stt_transcribe, tts_speak, tts_stop,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_export_file,
            read_import_file,
            ai_status,
            ai_chat,
            stt_transcribe,
            tts_speak,
            tts_stop,
            pick_model_path,
            download_model,
            is_native_desktop
        ])
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                use webkit2gtk::glib::object::ObjectExt;
                use webkit2gtk::{
                    PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, WebViewExt,
                };

                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(|webview| {
                        let wv = webview.inner();
                        if let Some(settings) = wv.settings() {
                            settings.set_enable_media_stream(true);
                            settings.set_enable_mediasource(true);
                            settings.set_enable_webrtc(true);
                        }
                        wv.connect_permission_request(|_, request| {
                            if request.is::<UserMediaPermissionRequest>() {
                                request.allow();
                                return true;
                            }
                            false
                        });
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Portfolio Tracker");
}
