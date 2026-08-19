use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "macos")]
fn copy_dir_all(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn main() {
    println!("cargo:warning=[BUILD] Starting build process...");

    // Build Swift plugin and place dylib before tauri_build validates resources
    #[cfg(target_os = "macos")]
    {
        println!("cargo:warning=[BUILD] macOS detected - compiling Swift plugin");
        compile_macos_sensing();
        println!("cargo:warning=[BUILD] Swift plugin compilation complete");
    }

    println!("cargo:warning=[BUILD] Running Tauri build...");
    tauri_build::build();
    println!("cargo:warning=[BUILD] Build process complete!");
}

#[cfg(target_os = "macos")]
fn compile_macos_sensing() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing"));
    let plugin_dir = manifest_dir.join("plugins/macos-sensing");
    let workspace_root = manifest_dir.parent().expect("workspace root should exist");
    let swift_build_dir = workspace_root.join(".swift-build/macos-sensing");
    let module_cache_dir = swift_build_dir.join("ModuleCache");

    println!("cargo:warning=[SWIFT] Building Swift plugin...");
    println!(
        "cargo:warning=[SWIFT]   Package path: {}",
        plugin_dir.display()
    );
    println!(
        "cargo:warning=[SWIFT]   Build dir: {}",
        swift_build_dir.display()
    );
    let _ = fs::create_dir_all(&module_cache_dir);

    let status = Command::new("swift")
        .args([
            "build",
            "--disable-sandbox",
            "-c",
            "release",
            "--package-path",
            plugin_dir.to_str().expect("plugin path invalid UTF-8"),
            "--product",
            "MacOSSensing",
            "--scratch-path",
            swift_build_dir
                .to_str()
                .expect("scratch path invalid UTF-8"),
        ])
        .env(
            "SWIFT_MODULECACHE_PATH",
            module_cache_dir
                .to_str()
                .expect("module cache path invalid UTF-8"),
        )
        .env(
            "CLANG_MODULE_CACHE_PATH",
            module_cache_dir
                .to_str()
                .expect("module cache path invalid UTF-8"),
        )
        .env("SWIFTPM_DISABLE_SANDBOX", "1")
        .status()
        .expect("Failed to spawn swift build");

    if !status.success() {
        println!("cargo:warning=[SWIFT] ❌ Build failed!");
        panic!("Swift plugin build failed");
    }

    println!("cargo:warning=[SWIFT] ✅ Swift build successful");

    let build_output = swift_build_dir.join("release");
    let dylib_name = "libMacOSSensing.dylib";
    let adapter_dylib_name = "libMediaRemoteAdapter.dylib";
    let adapter_bundle_name = "MediaRemoteAdapter_MediaRemoteAdapter.bundle";
    let dylib_path = build_output.join(dylib_name);
    let adapter_dylib_path = build_output.join(adapter_dylib_name);
    let adapter_bundle_path = build_output.join(adapter_bundle_name);

    println!("cargo:warning=[RUST] Configuring Rust linker...");
    println!(
        "cargo:warning=[RUST]   Library path: {}",
        build_output.display()
    );

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
    println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../Resources/Frameworks");

    // Copy dylib into app resources for bundling
    println!("cargo:warning=[COPY] Copying dylib to resources...");
    let resources_dir = manifest_dir.join("resources");
    let target_resource = resources_dir.join(dylib_name);
    let target_adapter_dylib = resources_dir.join(adapter_dylib_name);
    let target_adapter_bundle = resources_dir.join(adapter_bundle_name);
    let _ = fs::create_dir_all(&resources_dir);

    println!("cargo:warning=[COPY]   Source: {}", dylib_path.display());
    println!(
        "cargo:warning=[COPY]   Target: {}",
        target_resource.display()
    );

    // Best-effort copy; panic if missing source
    fs::copy(&dylib_path, &target_resource)
        .expect("Failed to copy libMacOSSensing.dylib into resources/");
    fs::copy(&adapter_dylib_path, &target_adapter_dylib)
        .expect("Failed to copy libMediaRemoteAdapter.dylib into resources/");
    copy_dir_all(&adapter_bundle_path, &target_adapter_bundle)
        .expect("Failed to copy MediaRemoteAdapter resource bundle into resources/");

    println!("cargo:warning=[COPY] ✅ Dylib copied successfully");

    println!("cargo:warning=[WATCH] Registering file watchers for Swift files...");
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
        plugin_dir.join("Vendor/mediaremote-adapter").to_str().unwrap()
    );
    println!(
        "cargo:rerun-if-changed={}",
        plugin_dir.join("Package.swift").to_str().unwrap()
    );
    println!("cargo:warning=[WATCH] ✅ File watchers registered");
}
