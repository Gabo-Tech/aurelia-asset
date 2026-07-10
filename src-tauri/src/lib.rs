mod commands;

use commands::{
    ai_chat, ai_status, download_model, is_native_desktop, pick_model_path, save_export_file,
    stt_transcribe, tts_speak, tts_stop,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_export_file,
            ai_status,
            ai_chat,
            stt_transcribe,
            tts_speak,
            tts_stop,
            pick_model_path,
            download_model,
            is_native_desktop
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running Portfolio Tracker");
}
