/// Configuration for segmentation algorithm with tunable thresholds.
#[derive(Debug, Clone)]
pub struct SegmentationConfig {
    /// Minimum segment duration (ignore shorter segments unless at timer boundary)
    pub min_segment_duration_secs: u64,

    /// Sandwich merge: A→B→A where B is this short gets merged
    pub sandwich_max_duration_secs: u64,

    /// Confidence scoring weights
    pub weight_duration: f64,
    pub weight_stability: f64,
    pub weight_visual: f64,
    pub weight_ocr: f64,
}

impl Default for SegmentationConfig {
    fn default() -> Self {
        Self {
            min_segment_duration_secs: 30,
            sandwich_max_duration_secs: 12,
            weight_duration: 0.30,
            weight_stability: 0.40,
            weight_visual: 0.15,
            weight_ocr: 0.15,
        }
    }
}

