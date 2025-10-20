use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    {
        compile_macos_sensing();
    }
}

#[cfg(target_os = "macos")]
fn compile_macos_sensing() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing"));
    let plugin_dir = manifest_dir.join("plugins/macos-sensing");

    let status = Command::new("swift")
        .args([
            "build",
            "-c",
            "release",
            "--package-path",
            plugin_dir.to_str().expect("plugin path invalid UTF-8"),
            "--product",
            "MacOSSensing",
        ])
        .status()
        .expect("Failed to spawn swift build");

    if !status.success() {
        panic!("Swift plugin build failed");
    }

    let build_output = plugin_dir.join(".build").join("release");
    println!(
        "cargo:rustc-link-search=native={}",
        build_output.to_str().expect("link path invalid UTF-8")
    );
    println!("cargo:rustc-link-lib=dylib=MacOSSensing");
    println!(
        "cargo:rustc-link-arg=-Wl,-rpath,{}",
        build_output.to_str().expect("link path invalid UTF-8")
    );

    println!(
        "cargo:rerun-if-changed={}",
        plugin_dir
            .join("Sources/MacOSSensing")
            .to_str()
            .unwrap()
    );
    println!(
        "cargo:rerun-if-changed={}",
        plugin_dir
            .join("Sources/CMacOSSensing")
            .to_str()
            .unwrap()
    );
    println!(
        "cargo:rerun-if-changed={}",
        plugin_dir.join("Package.swift").to_str().unwrap()
    );
}
