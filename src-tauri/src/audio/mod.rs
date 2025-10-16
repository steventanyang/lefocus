pub mod binaural;
pub mod brown_noise;
pub mod rain;

use binaural::BinauralBeats;
use brown_noise::BrownNoise;
use rain::RainSound;

use rodio::{OutputStream, Sink};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Sender},
    Arc, Mutex,
};
use std::thread;

enum AudioCommand {
    Start,
    Stop,
    Pause,
    Play,
    SetVolume(f32),
    AppendBinaural { left: f32, right: f32 },
    AppendBrownNoise,
    AppendRain,
}

pub struct AudioEngineHandle {
    tx: Arc<Mutex<Option<Sender<AudioCommand>>>>,
    is_paused: Arc<AtomicBool>,
}

impl AudioEngineHandle {
    pub fn new() -> Self {
        Self {
            tx: Arc::new(Mutex::new(None)),
            is_paused: Arc::new(AtomicBool::new(false)),
        }
    }

    fn ensure_thread(&self) -> Result<Sender<AudioCommand>, String> {
        if let Some(tx) = self.tx.lock().map_err(|e| e.to_string())?.as_ref() {
            return Ok(tx.clone());
        }

        let (tx, rx) = mpsc::channel::<AudioCommand>();
        let is_paused = Arc::clone(&self.is_paused);

        // Spawn dedicated audio thread holding non-Send audio objects
        thread::Builder::new()
            .name("audio-engine".to_string())
            .spawn(move || {
                let mut _stream: Option<OutputStream> = None;
                let mut sink: Option<Sink> = None;

                fn ensure_sink(
                    stream: &mut Option<OutputStream>,
                    sink: &mut Option<Sink>,
                ) -> Result<(), String> {
                    if sink.is_none() {
                        let (s, handle) = OutputStream::try_default()
                            .map_err(|e| format!("Failed to create audio output stream: {}", e))?;
                        let new_sink = Sink::try_new(&handle)
                            .map_err(|e| format!("Failed to create audio sink: {}", e))?;
                        *stream = Some(s);
                        *sink = Some(new_sink);
                    }
                    Ok(())
                }

                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        AudioCommand::Start => {
                            // Stop any existing
                            if let Some(s_old) = sink.take() {
                                s_old.stop();
                            }
                            _stream = None;
                            let _ = ensure_sink(&mut _stream, &mut sink);
                            is_paused.store(false, Ordering::SeqCst);
                        }
                        AudioCommand::Stop => {
                            if let Some(s_old) = sink.take() {
                                s_old.stop();
                            }
                            _stream = None;
                            is_paused.store(false, Ordering::SeqCst);
                        }
                        AudioCommand::Pause => {
                            if let Some(ref s) = sink {
                                s.pause();
                                is_paused.store(true, Ordering::SeqCst);
                            }
                        }
                        AudioCommand::Play => {
                            if let Some(ref s) = sink {
                                s.play();
                                is_paused.store(false, Ordering::SeqCst);
                            }
                        }
                        AudioCommand::SetVolume(v) => {
                            if let Some(ref s) = sink {
                                s.set_volume(v.clamp(0.0, 1.0));
                            }
                        }
                        AudioCommand::AppendBinaural { left, right } => {
                            let _ = ensure_sink(&mut _stream, &mut sink);
                            if let Some(ref s) = sink {
                                s.append(BinauralBeats::new(left, right));
                            }
                        }
                        AudioCommand::AppendBrownNoise => {
                            let _ = ensure_sink(&mut _stream, &mut sink);
                            if let Some(ref s) = sink {
                                s.append(BrownNoise::new());
                            }
                        }
                        AudioCommand::AppendRain => {
                            let _ = ensure_sink(&mut _stream, &mut sink);
                            if let Some(ref s) = sink {
                                s.append(RainSound::new());
                            }
                        }
                    }
                }
            })
            .map_err(|e| e.to_string())?;

        let tx_clone = tx.clone();
        *self.tx.lock().map_err(|e| e.to_string())? = Some(tx);
        Ok(tx_clone)
    }

    pub fn start(&self) -> Result<(), String> {
        let tx = self.ensure_thread()?;
        tx.send(AudioCommand::Start).map_err(|e| e.to_string())
    }

    pub fn set_volume(&self, volume: f32) -> Result<(), String> {
        let tx = self.ensure_thread()?;
        tx.send(AudioCommand::SetVolume(volume))
            .map_err(|e| e.to_string())
    }

    pub fn play(&self) -> Result<(), String> {
        let tx = self.ensure_thread()?;
        tx.send(AudioCommand::Play).map_err(|e| e.to_string())
    }

    pub fn pause(&self) -> Result<(), String> {
        let tx = self.ensure_thread()?;
        tx.send(AudioCommand::Pause).map_err(|e| e.to_string())
    }

    pub fn stop(&self) -> Result<(), String> {
        if let Ok(Some(tx)) = self.tx.lock().map(|g| g.clone()) {
            let _ = tx.send(AudioCommand::Stop);
        }
        Ok(())
    }

    pub fn is_paused(&self) -> Result<bool, String> {
        Ok(self.is_paused.load(Ordering::SeqCst))
    }

    pub fn append_binaural(&self, left: f32, right: f32) -> Result<(), String> {
        let tx = self.ensure_thread()?;
        tx.send(AudioCommand::AppendBinaural { left, right })
            .map_err(|e| e.to_string())
    }

    pub fn append_brown_noise(&self) -> Result<(), String> {
        let tx = self.ensure_thread()?;
        tx.send(AudioCommand::AppendBrownNoise)
            .map_err(|e| e.to_string())
    }

    pub fn append_rain(&self) -> Result<(), String> {
        let tx = self.ensure_thread()?;
        tx.send(AudioCommand::AppendRain).map_err(|e| e.to_string())
    }
}
