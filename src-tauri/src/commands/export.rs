use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Deserialize)]
pub struct SaveExportRequest {
    pub filename: String,
    pub contents: Option<String>,
    pub bytes_base64: Option<String>,
}

#[tauri::command]
pub async fn save_export_file(
    app: tauri::AppHandle,
    req: SaveExportRequest,
) -> Result<String, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(&req.filename)
        .blocking_save_file()
        .ok_or_else(|| "User cancelled save dialog".to_string())?;

    let path = picked
        .into_path()
        .map_err(|_| "Selected path is not available on this platform".to_string())?;

    if let Some(b64) = req.bytes_base64 {
        let bytes = STANDARD
            .decode(b64.trim())
            .map_err(|e| format!("Invalid base64 payload: {e}"))?;
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    } else if let Some(text) = req.contents {
        std::fs::write(&path, text).map_err(|e| e.to_string())?;
    } else {
        return Err("No export content provided".to_string());
    }

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_import_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    let Some(file) = picked else {
        return Ok(None);
    };

    let path = file
        .into_path()
        .map_err(|_| "Selected path is not available on this platform".to_string())?;

    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(contents))
}
