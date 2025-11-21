use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IslandSoundSettings {
    pub enabled: bool,
    pub sound_id: String,
}

impl Default for IslandSoundSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            sound_id: "island_default".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserSettings {
    island_sound: IslandSoundSettings,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            island_sound: IslandSoundSettings::default(),
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    data: RwLock<UserSettings>,
}

impl SettingsStore {
    pub fn new(path: PathBuf) -> Result<Self> {
        let data = if path.exists() {
            let contents = fs::read_to_string(&path)
                .with_context(|| format!("Failed to read settings from {}", path.display()))?;
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            UserSettings::default()
        };

        Ok(Self {
            path,
            data: RwLock::new(data),
        })
    }

    pub fn island_sound(&self) -> IslandSoundSettings {
        self.data.read().unwrap().island_sound.clone()
    }

    pub fn update_island_sound(&self, settings: IslandSoundSettings) -> Result<()> {
        {
            let mut guard = self.data.write().unwrap();
            guard.island_sound = settings;
            self.persist(&guard)?;
        }
        Ok(())
    }

    fn persist(&self, data: &UserSettings) -> Result<()> {
        let serialized = serde_json::to_string_pretty(data)?;
        fs::write(&self.path, serialized)
            .with_context(|| format!("Failed to write settings to {}", self.path.display()))
    }
}

impl SettingsStore {
    #[allow(dead_code)]
    pub fn reload(&self) -> Result<()> {
        let contents = fs::read_to_string(&self.path)?;
        let data: UserSettings = serde_json::from_str(&contents)?;
        let mut guard = self.data.write().unwrap();
        *guard = data;
        Ok(())
    }
}
