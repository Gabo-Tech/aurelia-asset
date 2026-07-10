//! On-device AI commands: local LLM (llama.cpp) + speech (Sherpa-ONNX).
//!
//! The command surface, request/response shapes and capability reporting are
//! final and match the TypeScript client (`src/lib/ai/*`). The heavy ML backends
//! are compiled only when their Cargo feature is enabled, so the default build
//! (and the web / Lovable build, which ignores `src-tauri` entirely) stays light
//! and fast:
//!
//!   - `llm`  → real llama.cpp inference (crate `llama-cpp-2`)
//!   - `stt`  → Sherpa-ONNX speech-to-text (crate `sherpa-onnx`)
//!   - `tts`  → Sherpa-ONNX text-to-speech (crate `sherpa-onnx`)
//!
//! With a feature disabled, the matching command returns a "not enabled" error
//! and the frontend transparently falls back to its built-in NLU engine and the
//! browser Web Speech API. Model locations come from the user's Settings and are
//! passed in on every call.
//!
//! Audio contract (keeps Rust free of container/codec decoding):
//!   - STT receives raw mono PCM f32 (little-endian, base64) already resampled
//!     to `sample_rate` by the frontend.
//!   - TTS returns raw mono PCM f32 (little-endian, base64) + sample rate, which
//!     the frontend plays via the Web Audio API.

#[cfg(any(feature = "stt", feature = "tts"))]
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Model locations chosen by the user in Settings. Mirrors `AiConfigPayload` in
/// `src/lib/ai/config.ts`.
#[derive(Debug, Default, Deserialize)]
pub struct AiConfig {
    #[serde(default)]
    pub llm_path: Option<String>,
    #[serde(default)]
    pub stt_dir: Option<String>,
    #[serde(default)]
    pub tts_dir: Option<String>,
}

/// Which on-device AI features are ready (compiled in *and* have model files).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub llm: bool,
    pub stt: bool,
    pub tts: bool,
    /// Whether the LLM backend was compiled into this binary.
    pub llm_enabled: bool,
    /// Whether the STT backend was compiled into this binary.
    pub stt_enabled: bool,
    /// Whether the TTS backend was compiled into this binary.
    pub tts_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTurn {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ToolCall {
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ChatRequest {
    pub system: String,
    pub messages: Vec<Value>,
    pub tools: Vec<Value>,
    #[serde(default)]
    pub model_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SttRequest {
    /// Base64 of little-endian f32 mono PCM samples.
    pub pcm_base64: String,
    pub sample_rate: i32,
    #[serde(default)]
    pub model_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct TtsRequest {
    pub text: String,
    #[serde(default)]
    pub model_dir: Option<String>,
}

/// PCM returned by TTS for playback on the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
    pub sample_rate: i32,
    /// Base64 of little-endian f32 mono PCM samples.
    pub samples_base64: String,
}

// ===== Path helpers =====

fn existing(path: &Option<String>) -> Option<String> {
    match path {
        Some(p) if !p.trim().is_empty() && Path::new(p).exists() => Some(p.clone()),
        _ => None,
    }
}

/// Resolve the LLM path from the request/config, falling back to an env var.
fn resolve_llm(explicit: &Option<String>) -> Option<String> {
    existing(explicit).or_else(|| existing(&std::env::var("AURELIA_LLM_MODEL").ok()))
}

fn resolve_dir(explicit: &Option<String>, env_key: &str) -> Option<String> {
    let from_cfg = explicit
        .as_ref()
        .filter(|p| !p.trim().is_empty() && Path::new(p).is_dir())
        .cloned();
    from_cfg.or_else(|| {
        std::env::var(env_key)
            .ok()
            .filter(|p| !p.trim().is_empty() && Path::new(p).is_dir())
    })
}

/// Find the first file in `dir` whose name contains all `needles` and ends with
/// `.onnx`/`.txt`/etc.
#[cfg(any(feature = "stt", feature = "tts"))]
fn find_file(dir: &str, needles: &[&str], ext: &str) -> Option<String> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.ends_with(ext) && needles.iter().all(|n| name.contains(n)) {
            return Some(entry.path().to_string_lossy().into_owned());
        }
    }
    None
}

#[cfg(any(feature = "stt", feature = "tts"))]
fn find_subdir(dir: &str, needle: &str) -> Option<String> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.contains(needle) {
                return Some(entry.path().to_string_lossy().into_owned());
            }
        }
    }
    None
}

// ===== Status =====

#[tauri::command]
pub fn ai_status(config: Option<AiConfig>) -> AiStatus {
    let cfg = config.unwrap_or_default();
    let llm = resolve_llm(&cfg.llm_path);
    let stt_dir = resolve_dir(&cfg.stt_dir, "AURELIA_STT_MODEL");
    let tts_dir = resolve_dir(&cfg.tts_dir, "AURELIA_TTS_MODEL");

    let llm_ready = cfg!(feature = "llm") && llm.is_some();
    let stt_ready = cfg!(feature = "stt") && stt_dir.is_some();
    let tts_ready = cfg!(feature = "tts") && tts_dir.is_some();

    AiStatus {
        llm: llm_ready,
        stt: stt_ready,
        tts: tts_ready,
        llm_enabled: cfg!(feature = "llm"),
        stt_enabled: cfg!(feature = "stt"),
        tts_enabled: cfg!(feature = "tts"),
        model: if llm_ready {
            llm.and_then(|p| {
                PathBuf::from(&p)
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
            })
        } else {
            None
        },
    }
}

// ===== Native model picker (uses the dialog plugin already in the app) =====

#[tauri::command]
pub async fn pick_model_path(
    app: tauri::AppHandle,
    kind: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};

    let picked: Option<FilePath> = if kind == "dir" {
        pick_folder_path(&app)?
    } else {
        app.dialog().file().blocking_pick_file()
    };
    Ok(picked.and_then(|p| p.into_path().ok().map(|pb| pb.to_string_lossy().into_owned())))
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn pick_folder_path(app: &tauri::AppHandle) -> Result<Option<tauri_plugin_dialog::FilePath>, String> {
    use tauri_plugin_dialog::DialogExt;
    Ok(app.dialog().file().blocking_pick_folder())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn pick_folder_path(_app: &tauri::AppHandle) -> Result<Option<tauri_plugin_dialog::FilePath>, String> {
    Err("folder-picker-unavailable-on-mobile".into())
}

// ===== Chat (LLM) =====

#[tauri::command]
pub fn ai_chat(req: ChatRequest) -> Result<ModelTurn, String> {
    let model_path = resolve_llm(&req.model_path).ok_or("llm-not-loaded")?;
    #[cfg(feature = "llm")]
    {
        llm_backend::run(&req.system, &req.messages, &req.tools, &model_path)
    }
    #[cfg(not(feature = "llm"))]
    {
        let _ = (model_path, &req);
        Err("llm-not-enabled".to_string())
    }
}

// ===== Speech-to-Text =====

#[tauri::command]
pub fn stt_transcribe(req: SttRequest) -> Result<String, String> {
    let dir = resolve_dir(&req.model_dir, "AURELIA_STT_MODEL").ok_or("stt-no-model")?;
    #[cfg(feature = "stt")]
    {
        let samples = decode_pcm_f32(&req.pcm_base64)?;
        stt_backend::run(&samples, req.sample_rate, &dir)
    }
    #[cfg(not(feature = "stt"))]
    {
        let _ = (dir, &req);
        Err("stt-not-enabled".to_string())
    }
}

// ===== Text-to-Speech =====

#[tauri::command]
pub fn tts_speak(req: TtsRequest) -> Result<TtsResult, String> {
    let dir = resolve_dir(&req.model_dir, "AURELIA_TTS_MODEL").ok_or("tts-no-model")?;
    #[cfg(feature = "tts")]
    {
        let (sample_rate, samples) = tts_backend::run(&req.text, &dir)?;
        Ok(TtsResult {
            sample_rate,
            samples_base64: encode_pcm_f32(&samples),
        })
    }
    #[cfg(not(feature = "tts"))]
    {
        let _ = (dir, &req);
        Err("tts-not-enabled".to_string())
    }
}

#[tauri::command]
pub fn tts_stop() -> Result<(), String> {
    // Native playback happens on the frontend (Web Audio), so there is nothing
    // to stop here. Kept for API symmetry.
    Ok(())
}

// ===== PCM (de)serialization =====

#[cfg(feature = "stt")]
fn decode_pcm_f32(b64: &str) -> Result<Vec<f32>, String> {
    let bytes = STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("bad pcm base64: {e}"))?;
    Ok(bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect())
}

#[cfg(feature = "tts")]
fn encode_pcm_f32(samples: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(samples.len() * 4);
    for s in samples {
        bytes.extend_from_slice(&s.to_le_bytes());
    }
    STANDARD.encode(bytes)
}

// ===== llama.cpp backend =====

#[cfg(feature = "llm")]
mod llm_backend {
    use super::{ModelTurn, ToolCall};
    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::{AddBos, LlamaModel, Special};
    use llama_cpp_2::sampling::LlamaSampler;
    use serde_json::Value;
    use std::num::NonZeroU32;
    use std::sync::{Mutex, OnceLock};

    // The backend can only be initialised once per process; the model is
    // expensive to load so we cache both keyed by path. A fresh context is
    // created per request (cheap relative to model load).
    struct Cache {
        backend: LlamaBackend,
        path: String,
        model: LlamaModel,
    }
    static CACHE: OnceLock<Mutex<Option<Cache>>> = OnceLock::new();

    const MAX_NEW_TOKENS: usize = 512;
    const N_CTX: u32 = 4096;

    pub fn run(
        system: &str,
        messages: &[Value],
        tools: &[Value],
        model_path: &str,
    ) -> Result<ModelTurn, String> {
        let cell = CACHE.get_or_init(|| Mutex::new(None));
        let mut guard = cell.lock().map_err(|_| "llm-lock-poisoned".to_string())?;

        // (Re)load the model if the path changed.
        if guard.as_ref().map(|c| c.path.as_str()) != Some(model_path) {
            let backend = LlamaBackend::init().map_err(|e| format!("backend init: {e}"))?;
            let model = LlamaModel::load_from_file(
                &backend,
                model_path,
                &LlamaModelParams::default(),
            )
            .map_err(|e| format!("load model: {e}"))?;
            *guard = Some(Cache {
                backend,
                path: model_path.to_string(),
                model,
            });
        }
        let cache = guard.as_ref().unwrap();

        let prompt = build_chatml(system, messages, tools);
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(NonZeroU32::new(N_CTX));
        let mut ctx = cache
            .model
            .new_context(&cache.backend, ctx_params)
            .map_err(|e| format!("new context: {e}"))?;

        let tokens = cache
            .model
            .str_to_token(&prompt, AddBos::Always)
            .map_err(|e| format!("tokenize: {e}"))?;

        let mut batch = LlamaBatch::new(N_CTX as usize, 1);
        let last = tokens.len() - 1;
        for (i, tok) in tokens.iter().enumerate() {
            batch
                .add(*tok, i as i32, &[0], i == last)
                .map_err(|e| format!("batch add: {e}"))?;
        }
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;

        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(0.3),
            LlamaSampler::dist(1234),
        ]);

        let mut out = String::new();
        let mut pos = tokens.len() as i32;
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        for _ in 0..MAX_NEW_TOKENS {
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);
            if cache.model.is_eog_token(token) {
                break;
            }
            let bytes = cache
                .model
                .token_to_bytes(token, Special::Plaintext)
                .map_err(|e| format!("detok: {e}"))?;
            let mut piece = String::new();
            let _ = decoder.decode_to_string(&bytes, &mut piece, false);
            out.push_str(&piece);
            if out.contains("<|im_end|>") {
                break;
            }
            batch.clear();
            batch
                .add(token, pos, &[0], true)
                .map_err(|e| format!("batch add: {e}"))?;
            ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
            pos += 1;
        }

        Ok(parse_turn(&out))
    }

    /// Render system + tool specs + conversation as Qwen ChatML.
    fn build_chatml(system: &str, messages: &[Value], tools: &[Value]) -> String {
        let tools_json = serde_json::to_string(tools).unwrap_or_else(|_| "[]".to_string());
        let mut s = String::new();
        s.push_str("<|im_start|>system\n");
        s.push_str(system);
        s.push_str("\n\nYou can call tools. Tool schemas (JSON): ");
        s.push_str(&tools_json);
        s.push_str(
            "\nTo call a tool, reply with ONLY a JSON object like \
             {\"tool_call\":{\"name\":\"...\",\"arguments\":{...}}}. \
             Otherwise reply normally in plain text.<|im_end|>\n",
        );
        for m in messages {
            let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let content = m.get("content").and_then(|c| c.as_str()).unwrap_or("");
            let tag = match role {
                "assistant" => "assistant",
                "tool" => "tool",
                _ => "user",
            };
            s.push_str("<|im_start|>");
            s.push_str(tag);
            s.push('\n');
            s.push_str(content);
            s.push_str("<|im_end|>\n");
        }
        s.push_str("<|im_start|>assistant\n");
        s
    }

    /// Parse model output into a tool call or plain content.
    fn parse_turn(raw: &str) -> ModelTurn {
        let text = raw.replace("<|im_end|>", "").trim().to_string();
        if let Some(tc) = extract_tool_call(&text) {
            return ModelTurn {
                tool_calls: Some(vec![tc]),
                content: None,
            };
        }
        ModelTurn {
            tool_calls: None,
            content: Some(text),
        }
    }

    fn extract_tool_call(text: &str) -> Option<ToolCall> {
        // Strip common ```json fences, then find the first {...} block.
        let cleaned = text
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();
        let start = cleaned.find('{')?;
        let end = cleaned.rfind('}')?;
        if end <= start {
            return None;
        }
        let json = &cleaned[start..=end];
        let v: Value = serde_json::from_str(json).ok()?;
        let tc = v.get("tool_call").or(Some(&v))?;
        let name = tc.get("name").and_then(|n| n.as_str())?.to_string();
        let arguments = tc.get("arguments").cloned().unwrap_or(Value::Null);
        Some(ToolCall { name, arguments })
    }
}

// ===== Sherpa-ONNX STT backend =====

#[cfg(feature = "stt")]
mod stt_backend {
    use super::{find_file, find_subdir};
    use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig};

    pub fn run(samples: &[f32], sample_rate: i32, dir: &str) -> Result<String, String> {
        let mut config = OfflineRecognizerConfig::default();
        let tokens = find_file(dir, &["tokens"], ".txt").ok_or("stt: tokens.txt not found")?;
        config.model_config.tokens = Some(tokens);
        config.model_config.debug = false;

        // Detect the model family from the files present.
        let encoder = find_file(dir, &["encoder"], ".onnx");
        let decoder = find_file(dir, &["decoder"], ".onnx");
        let joiner = find_file(dir, &["joiner"], ".onnx");

        if let (Some(enc), Some(dec), Some(join)) = (&encoder, &decoder, &joiner) {
            config.model_config.transducer.encoder = Some(enc.clone());
            config.model_config.transducer.decoder = Some(dec.clone());
            config.model_config.transducer.joiner = Some(join.clone());
            config.model_config.model_type = Some("transducer".into());
        } else if let (Some(enc), Some(dec)) = (&encoder, &decoder) {
            // Whisper (encoder/decoder, no joiner).
            config.model_config.whisper.encoder = Some(enc.clone());
            config.model_config.whisper.decoder = Some(dec.clone());
            config.model_config.model_type = Some("whisper".into());
        } else if let Some(model) =
            find_file(dir, &["sense"], ".onnx").or_else(|| find_file(dir, &["model"], ".onnx"))
        {
            config.model_config.sense_voice.model = Some(model);
            config.model_config.model_type = Some("sense_voice".into());
        } else {
            return Err("stt: no recognizable model files in folder".into());
        }
        let _ = find_subdir; // reserved for models that ship subfolders

        let recognizer =
            OfflineRecognizer::create(&config).ok_or("stt: failed to create recognizer")?;
        let stream = recognizer.create_stream();
        stream.accept_waveform(sample_rate, samples);
        recognizer.decode(&stream);
        let result = stream.get_result().ok_or("stt: no result")?;
        Ok(result.text)
    }
}

// ===== Sherpa-ONNX TTS backend =====

#[cfg(feature = "tts")]
mod tts_backend {
    use super::{find_file, find_subdir};
    use sherpa_onnx::{GenerationConfig, OfflineTts, OfflineTtsConfig};

    pub fn run(text: &str, dir: &str) -> Result<(i32, Vec<f32>), String> {
        let model = find_file(dir, &["model"], ".onnx")
            .or_else(|| find_file(dir, &[], ".onnx"))
            .ok_or("tts: model .onnx not found")?;
        let tokens = find_file(dir, &["tokens"], ".txt").ok_or("tts: tokens.txt not found")?;

        let mut config = OfflineTtsConfig::default();
        config.model.vits.model = Some(model);
        config.model.vits.tokens = Some(tokens);
        if let Some(lexicon) = find_file(dir, &["lexicon"], ".txt") {
            config.model.vits.lexicon = Some(lexicon);
        }
        if let Some(data_dir) = find_subdir(dir, "espeak") {
            config.model.vits.data_dir = Some(data_dir);
        }
        if let Some(dict_dir) = find_subdir(dir, "dict") {
            config.model.vits.dict_dir = Some(dict_dir);
        }

        let tts = OfflineTts::create(&config).ok_or("tts: failed to create engine")?;
        let sample_rate = tts.sample_rate();
        let gen = GenerationConfig {
            sid: 0,
            speed: 1.0,
            ..Default::default()
        };
        let audio = tts
            .generate_with_config(text, &gen, None::<fn(&[f32], f32) -> bool>)
            .ok_or("tts: generation failed")?;
        Ok((sample_rate, audio.samples().to_vec()))
    }
}
