use std::env;
use std::fs;
use std::path::PathBuf;

/// Copy Sherpa-ONNX shared libs beside the built binary and embed $ORIGIN rpath
/// so the dynamic linker finds them at runtime (works with spaces in paths).
fn setup_sherpa_runtime_libs(manifest_dir: &PathBuf) {
    let lib_src = manifest_dir.join("../native/sherpa-onnx/lib");
    let marker = lib_src.join("libsherpa-onnx-c-api.so");
    if !marker.is_file() {
        return;
    }

    println!("cargo:rerun-if-changed={}", marker.display());

    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let target_dir = manifest_dir.join("target").join(&profile);
    if fs::create_dir_all(&target_dir).is_err() {
        return;
    }

    for name in [
        "libsherpa-onnx-c-api.so",
        "libonnxruntime.so",
        "libsherpa-onnx-cxx-api.so",
    ] {
        let src = lib_src.join(name);
        if src.is_file() {
            let _ = fs::copy(&src, target_dir.join(name));
        }
    }

    if let Ok(canonical) = lib_src.canonicalize() {
        println!("cargo:rustc-link-search=native={}", canonical.display());
    }
    // Resolve libs from the executable's directory (where we copy them above).
    println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
}

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    setup_sherpa_runtime_libs(&manifest_dir);
    tauri_build::build();
}
