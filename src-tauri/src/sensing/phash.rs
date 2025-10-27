use anyhow::Result;
use image::{GenericImageView, ImageFormat};
use image_hasher::{HashAlg, HasherConfig, ImageHash};

pub fn compute_phash(png_bytes: &[u8]) -> Result<String> {
    use log::debug;
    
    let img = image::load_from_memory_with_format(png_bytes, ImageFormat::Png)?;
    let (width, height) = img.dimensions();
    
    debug!("pHash: Processing {}×{} image ({} bytes)", width, height, png_bytes.len());
    
    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::DoubleGradient)
        .hash_size(8, 8)
        .to_hasher();

    let hash = hasher.hash_image(&img);
    let result = hash.to_base64();
    
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
