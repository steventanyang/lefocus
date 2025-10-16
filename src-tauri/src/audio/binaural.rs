use rodio::Source;
use std::f32::consts::PI;
use std::time::Duration;

/// Binaural beat generator
/// Plays two slightly different frequencies in each ear to create a perceived "beat"
pub struct BinauralBeats {
    left_freq: f32,
    right_freq: f32,
    sample_rate: u32,
    num_sample: usize,
}

impl BinauralBeats {
    pub fn new(left_freq: f32, right_freq: f32) -> Self {
        Self {
            left_freq,
            right_freq,
            sample_rate: 44100,
            num_sample: 0,
        }
    }
}

impl Iterator for BinauralBeats {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        self.num_sample = self.num_sample.wrapping_add(1);

        let t = self.num_sample as f32 / self.sample_rate as f32;

        // Alternate between left and right channels (stereo interleaved)
        let sample = if self.num_sample % 2 == 0 {
            // Left channel
            (2.0 * PI * self.left_freq * t).sin()
        } else {
            // Right channel
            (2.0 * PI * self.right_freq * t).sin()
        };

        Some(sample * 0.15) // Lower amplitude to prevent clipping
    }
}

impl Source for BinauralBeats {
    fn current_frame_len(&self) -> Option<usize> {
        None // Infinite stream
    }

    fn channels(&self) -> u16 {
        2 // Stereo
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None // Infinite
    }
}
