use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rodio::Source;
use std::time::Duration;

/// Rain sound generator
/// Uses filtered brown noise with amplitude modulation to simulate rain
pub struct RainSound {
    sample_rate: u32,
    last_brown: f32,
    // Simple 2nd order bandpass filter state
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
    rng: StdRng,
    modulation_phase: f32,
}

impl RainSound {
    pub fn new() -> Self {
        Self {
            sample_rate: 44100,
            last_brown: 0.0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
            rng: StdRng::from_entropy(),
            modulation_phase: 0.0,
        }
    }

    // Generate brown noise sample
    fn brown_noise_sample(&mut self) -> f32 {
        let white = self.rng.gen_range(-1.0..1.0);
        self.last_brown += white * 0.02;
        self.last_brown = self.last_brown.clamp(-1.0, 1.0);
        self.last_brown *= 0.9999;
        self.last_brown
    }

    // Simple bandpass filter (centered around 2-4 kHz for rain-like texture)
    fn bandpass_filter(&mut self, input: f32) -> f32 {
        // Butterworth bandpass filter coefficients (approximated)
        // Center frequency ~3kHz, Q ~0.7
        let b0 = 0.1;
        let b1 = 0.0;
        let b2 = -0.1;
        let a1 = -1.8;
        let a2 = 0.85;

        let output = b0 * input + b1 * self.x1 + b2 * self.x2 - a1 * self.y1 - a2 * self.y2;

        // Update state
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;

        output
    }
}

impl Iterator for RainSound {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        // Generate brown noise
        let brown = self.brown_noise_sample();

        // Apply bandpass filter for rain-like frequency content
        let filtered = self.bandpass_filter(brown);

        // Add slow amplitude modulation for more natural rain sound
        self.modulation_phase += 0.3 / self.sample_rate as f32;
        if self.modulation_phase > std::f32::consts::TAU {
            self.modulation_phase -= std::f32::consts::TAU;
        }
        let modulation = 0.7 + 0.3 * self.modulation_phase.sin();

        // Mix filtered noise with slight unfiltered noise for texture
        let mix = filtered * 0.8 + brown * 0.2;

        Some(mix * modulation * 0.4)
    }
}

impl Source for RainSound {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> u16 {
        1 // Mono
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}
