use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Build Swift plugin and place dylib before tauri_build validates resources
    #[cfg(target_os = "macos")]
    {
        compile_macos_sensing();
    }

    tauri_build::build();
}

#[cfg(target_os = "macos")]
fn compile_macos_sensing() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing"));
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
    let dylib_name = "libMacOSSensing.dylib";
    let dylib_path = build_output.join(dylib_name);
    println!(
        "cargo:rustc-link-search=native={}",
        build_output.to_str().expect("link path invalid UTF-8")
    );
    println!("cargo:rustc-link-lib=dylib=MacOSSensing");
    // rpaths for dev (build dir) and packaged app (Frameworks/Resources)
    println!(
        "cargo:rustc-link-arg=-Wl,-rpath,{}",
        build_output.to_str().expect("link path invalid UTF-8")
    );
    println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../Frameworks");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../Resources");

    // Copy dylib into app resources for bundling
    let resources_dir = manifest_dir.join("resources");
    let target_resource = resources_dir.join(dylib_name);
    let _ = fs::create_dir_all(&resources_dir);
    // Best-effort copy; panic if missing source
    fs::copy(&dylib_path, &target_resource)
        .expect("Failed to copy libMacOSSensing.dylib into resources/");

    println!(
        "cargo:rerun-if-changed={}",
        plugin_dir.join("Sources/MacOSSensing").to_str().unwrap()
    );
    println!(
        "cargo:rerun-if-changed={}",
        plugin_dir.join("Sources/CMacOSSensing").to_str().unwrap()
    );
    println!(
        "cargo:rerun-if-changed={}",
        plugin_dir.join("Package.swift").to_str().unwrap()
    );
}
