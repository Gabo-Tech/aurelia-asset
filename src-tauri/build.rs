use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn copy_if_exists(src_dir: &Path, dest_dir: &Path, names: &[&str]) {
    for name in names {
        let src = src_dir.join(name);
        if src.is_file() {
            let _ = fs::copy(&src, dest_dir.join(name));
        }
    }
}

/// Copy Sherpa-ONNX shared libs beside the built binary and embed a loader path
/// so the dynamic linker finds them at runtime.
fn setup_sherpa_runtime_libs(manifest_dir: &PathBuf) {
    let lib_src = manifest_dir.join("../native/sherpa-onnx/lib");
    if !lib_src.is_dir() {
        return;
    }

    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let target_dir = manifest_dir.join("target").join(&profile);
    if fs::create_dir_all(&target_dir).is_err() {
        return;
    }

    #[cfg(target_os = "linux")]
    {
        let marker = lib_src.join("libsherpa-onnx-c-api.so");
        if !marker.is_file() {
            return;
        }
        println!("cargo:rerun-if-changed={}", marker.display());
        copy_if_exists(
            &lib_src,
            &target_dir,
            &[
                "libsherpa-onnx-c-api.so",
                "libonnxruntime.so",
                "libsherpa-onnx-cxx-api.so",
            ],
        );
        if let Ok(canonical) = lib_src.canonicalize() {
            println!("cargo:rustc-link-search=native={}", canonical.display());
        }
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
    }

    #[cfg(target_os = "macos")]
    {
        let marker = lib_src.join("libsherpa-onnx-c-api.dylib");
        if !marker.is_file() {
            return;
        }
        println!("cargo:rerun-if-changed={}", marker.display());
        copy_if_exists(
            &lib_src,
            &target_dir,
            &[
                "libsherpa-onnx-c-api.dylib",
                "libonnxruntime.dylib",
                "libsherpa-onnx-cxx-api.dylib",
            ],
        );
        if let Ok(canonical) = lib_src.canonicalize() {
            println!("cargo:rustc-link-search=native={}", canonical.display());
        }
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    }

    #[cfg(target_os = "windows")]
    {
        let marker = lib_src.join("sherpa-onnx-c-api.dll");
        if !marker.is_file() {
            return;
        }
        println!("cargo:rerun-if-changed={}", marker.display());
        copy_if_exists(
            &lib_src,
            &target_dir,
            &[
                "sherpa-onnx-c-api.dll",
                "onnxruntime.dll",
                "sherpa-onnx-cxx-api.dll",
            ],
        );
        if let Ok(canonical) = lib_src.canonicalize() {
            println!("cargo:rustc-link-search=native={}", canonical.display());
        }
    }
}

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    setup_sherpa_runtime_libs(&manifest_dir);
    tauri_build::build();
}
