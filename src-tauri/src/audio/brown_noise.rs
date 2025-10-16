use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rodio::Source;
use std::time::Duration;

/// Brown noise generator (also known as Brownian noise or red noise)
/// Power decreases 6 dB per octave, creating a deep rumbling sound
pub struct BrownNoise {
    sample_rate: u32,
    last_value: f32,
    rng: StdRng,
}

impl BrownNoise {
    pub fn new() -> Self {
        Self {
            sample_rate: 44100,
            last_value: 0.0,
            rng: StdRng::from_entropy(),
        }
    }
}

impl Iterator for BrownNoise {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        // Generate random value between -1 and 1
        let white = self.rng.gen_range(-1.0..1.0);

        // Brown noise is the integral of white noise
        // Add small random steps and clamp to prevent drift
        self.last_value += white * 0.02;
        self.last_value = self.last_value.clamp(-1.0, 1.0);

        // Apply a decay to prevent DC offset buildup
        self.last_value *= 0.9999;

        Some(self.last_value * 0.3) // Scale down amplitude
    }
}

impl Source for BrownNoise {
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
