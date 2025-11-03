use anyhow::Result;
use image::{GenericImageView, ImageFormat};
use image_hasher::{HashAlg, HasherConfig, ImageHash};

pub fn compute_phash(png_bytes: &[u8]) -> Result<String> {
    use log::{debug, info};
    use std::time::Instant;

    let start = Instant::now();

    // Decode PNG image
    let decode_start = Instant::now();
    let img = image::load_from_memory_with_format(png_bytes, ImageFormat::Png)?;
    let (width, height) = img.dimensions();
    let decode_time_ms = decode_start.elapsed().as_millis();

    info!(
        "pHash: Decoded {}×{} image ({} bytes) in {}ms",
        width,
        height,
        png_bytes.len(),
        decode_time_ms
    );

    // Downscale image before hashing - pHash works on small images anyway
    // This dramatically speeds up hash computation
    let downscale_start = Instant::now();
    let small_img = if width > 256 || height > 256 {
        // Downscale to max 256px while preserving aspect ratio
        let scale = 256.0 / width.max(height) as f32;
        let new_width = (width as f32 * scale) as u32;
        let new_height = (height as f32 * scale) as u32;
        let resized_buffer = image::imageops::resize(
            &img.to_rgba8(),
            new_width,
            new_height,
            image::imageops::FilterType::Triangle,
        );
        image::DynamicImage::ImageRgba8(resized_buffer)
    } else {
        img
    };
    let downscale_time_ms = downscale_start.elapsed().as_millis();
    let (small_width, small_height) = small_img.dimensions();
    if small_width < width || small_height < height {
        info!(
            "pHash: Downscaled {}×{} → {}×{} in {}ms",
            width, height, small_width, small_height, downscale_time_ms
        );
    }

    // Configure hasher
    let config_start = Instant::now();
    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::DoubleGradient)
        .hash_size(8, 8)
        .to_hasher();
    let config_time_ms = config_start.elapsed().as_millis();

    // Compute hash on downscaled image
    let hash_start = Instant::now();
    let hash = hasher.hash_image(&small_img);
    let hash_time_ms = hash_start.elapsed().as_millis();

    // Convert to base64
    let encode_start = Instant::now();
    let result = hash.to_base64();
    let encode_time_ms = encode_start.elapsed().as_millis();

    let total_time_ms = start.elapsed().as_millis();

    info!("pHash breakdown: decode={}ms, downscale={}ms, config={}ms, hash={}ms, encode={}ms, total={}ms", 
        decode_time_ms, downscale_time_ms, config_time_ms, hash_time_ms, encode_time_ms, total_time_ms);

    debug!("pHash result: {} (len={})", result, result.len());

    Ok(result)
}

pub fn compute_hamming_distance(lhs: &str, rhs: &str) -> u32 {
    let Ok(h1) = ImageHash::<Vec<u8>>::from_base64(lhs) else {
        return u32::MAX;
    };
    let Ok(h2) = ImageHash::<Vec<u8>>::from_base64(rhs) else {
        return u32::MAX;
    };
    h1.dist(&h2)
}
