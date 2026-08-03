//! Download and install on-device AI model files into the app data directory.

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModelKind {
    Llm,
    Stt,
    Tts,
}

impl ModelKind {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim().to_lowercase().as_str() {
            "llm" => Ok(Self::Llm),
            "stt" => Ok(Self::Stt),
            "tts" => Ok(Self::Tts),
            _ => Err(format!("unknown model kind: {raw}")),
        }
    }

    fn subdir(self) -> &'static str {
        match self {
            Self::Llm => "llm",
            Self::Stt => "stt",
            Self::Tts => "tts",
        }
    }
}

struct ModelManifest {
    url: &'static str,
    /// Lowercase hex SHA-256. Empty skips verification.
    sha256: &'static str,
    archive: bool,
    filename: &'static str,
}

fn manifest(kind: ModelKind) -> ModelManifest {
    match kind {
        ModelKind::Llm => ModelManifest {
            url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
            sha256: "",
            archive: false,
            filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        },
        ModelKind::Stt => ModelManifest {
            url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en-2024-04-30.tar.bz2",
            sha256: "",
            archive: true,
            filename: "sherpa-onnx-whisper-tiny.en-2024-04-30.tar.bz2",
        },
        ModelKind::Tts => ModelManifest {
            url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-medium.tar.bz2",
            sha256: "",
            archive: true,
            filename: "vits-piper-en_US-lessac-medium.tar.bz2",
        },
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    kind: String,
    received: u64,
    total: Option<u64>,
    phase: String,
}

fn models_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))
        .map(|p| p.join("models"))
}

fn emit_progress(app: &AppHandle, kind: &str, received: u64, total: Option<u64>, phase: &str) {
    let _ = app.emit(
        "model-download-progress",
        DownloadProgress {
            kind: kind.to_string(),
            received,
            total,
            phase: phase.to_string(),
        },
    );
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    if expected.is_empty() {
        return Ok(());
    }
    let mut file = File::open(path).map_err(|e| format!("open for hash: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("read for hash: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let digest = format!("{:x}", hasher.finalize());
    if digest != expected.to_lowercase() {
        return Err(format!("checksum mismatch (expected {expected}, got {digest})"));
    }
    Ok(())
}

fn find_gguf(dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name()?.to_string_lossy().to_lowercase();
            if name.ends_with(".gguf") {
                return Some(path);
            }
        }
    }
    None
}

fn looks_like_stt_dir(dir: &Path) -> bool {
    dir.is_dir()
        && (dir.join("tokens.txt").is_file()
            || find_file_in_dir(dir, "tokens", ".txt").is_some())
}

fn looks_like_tts_dir(dir: &Path) -> bool {
    dir.is_dir()
        && (find_file_in_dir(dir, "tokens", ".txt").is_some()
            && find_file_in_dir(dir, "model", ".onnx")
                .or_else(|| find_file_in_dir(dir, "", ".onnx"))
                .is_some())
}

fn find_file_in_dir(dir: &Path, needle: &str, ext: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name()?.to_string_lossy().to_lowercase();
        if name.ends_with(ext) && (needle.is_empty() || name.contains(needle)) {
            return Some(path);
        }
    }
    None
}

fn resolve_model_path(kind: ModelKind, root: &Path) -> Option<String> {
    let dir = root.join(kind.subdir());
    if !dir.exists() {
        return None;
    }
    match kind {
        ModelKind::Llm => find_gguf(&dir).map(|p| p.to_string_lossy().into_owned()),
        ModelKind::Stt => {
            if looks_like_stt_dir(&dir) {
                return Some(dir.to_string_lossy().into_owned());
            }
            // Tarballs often extract into a nested folder.
            let entries = fs::read_dir(&dir).ok()?;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && looks_like_stt_dir(&path) {
                    return Some(path.to_string_lossy().into_owned());
                }
            }
            None
        }
        ModelKind::Tts => {
            if looks_like_tts_dir(&dir) {
                return Some(dir.to_string_lossy().into_owned());
            }
            let entries = fs::read_dir(&dir).ok()?;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && looks_like_tts_dir(&path) {
                    return Some(path.to_string_lossy().into_owned());
                }
            }
            None
        }
    }
}

fn extract_tar_bz2(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| format!("open archive: {e}"))?;
    let decompressor = bzip2::read::BzDecoder::new(file);
    let mut archive = tar::Archive::new(decompressor);
    archive
        .unpack(dest)
        .map_err(|e| format!("extract archive: {e}"))
}

fn flatten_single_subdir(dir: &Path) -> Result<(), String> {
    let mut subdirs = Vec::new();
    let mut files = 0usize;
    for entry in fs::read_dir(dir).map_err(|e| format!("read dir: {e}"))? {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        if entry.path().is_dir() {
            subdirs.push(entry.path());
        } else {
            files += 1;
        }
    }
    if files == 0 && subdirs.len() == 1 {
        let nested = &subdirs[0];
        for entry in fs::read_dir(nested).map_err(|e| format!("read nested: {e}"))? {
            let entry = entry.map_err(|e| format!("nested entry: {e}"))?;
            let target = dir.join(entry.file_name());
            fs::rename(entry.path(), target).map_err(|e| format!("flatten move: {e}"))?;
        }
        fs::remove_dir_all(nested).map_err(|e| format!("remove nested dir: {e}"))?;
    }
    Ok(())
}

async fn download_to_file(
    app: &AppHandle,
    kind: &str,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    emit_progress(app, kind, 0, None, "downloading");

    let client = reqwest::Client::builder()
        .user_agent("AureliaAsset/0.1 model-downloader")
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("download failed: HTTP {}", response.status()));
    }

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = File::create(dest).map_err(|e| format!("create file: {e}"))?;
    let mut received: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download stream: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("write file: {e}"))?;
        received += chunk.len() as u64;
        emit_progress(app, kind, received, total, "downloading");
    }

    file.sync_all().map_err(|e| format!("flush file: {e}"))?;
    emit_progress(app, kind, received, total, "downloaded");
    Ok(())
}

#[tauri::command]
pub fn is_native_desktop() -> bool {
    !cfg!(any(target_os = "android", target_os = "ios"))
}

#[tauri::command]
pub async fn download_model(app: AppHandle, kind: String) -> Result<String, String> {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return Err("model-download-not-available-on-mobile".into());
    }

    let kind_enum = ModelKind::parse(&kind)?;
    let kind_str = kind_enum.subdir();
    let manifest = manifest(kind_enum);
    let root = models_root(&app)?;
    let dest_dir = root.join(kind_enum.subdir());
    fs::create_dir_all(&dest_dir).map_err(|e| format!("create model dir: {e}"))?;

    if let Some(existing) = resolve_model_path(kind_enum, &root) {
        emit_progress(&app, kind_str, 0, None, "ready");
        return Ok(existing);
    }

    let tmp_dir = root.join(".tmp");
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("create tmp dir: {e}"))?;
    let tmp_file = tmp_dir.join(manifest.filename);

    if tmp_file.exists() {
        let _ = fs::remove_file(&tmp_file);
    }

    download_to_file(&app, kind_str, manifest.url, &tmp_file).await?;
    verify_sha256(&tmp_file, manifest.sha256)?;

    emit_progress(&app, kind_str, 0, None, "extracting");

    if manifest.archive {
        extract_tar_bz2(&tmp_file, &dest_dir)?;
        let _ = fs::remove_file(&tmp_file);
        flatten_single_subdir(&dest_dir)?;
    } else {
        let final_path = dest_dir.join(manifest.filename);
        if final_path.exists() {
            let _ = fs::remove_file(&final_path);
        }
        fs::rename(&tmp_file, &final_path).map_err(|e| format!("move model file: {e}"))?;
    }

    let _ = fs::remove_dir_all(&tmp_dir);

    let resolved = resolve_model_path(kind_enum, &root)
        .ok_or_else(|| format!("{kind_str} model installed but path could not be resolved"))?;

    emit_progress(&app, kind_str, 0, None, "ready");
    Ok(resolved)
}
