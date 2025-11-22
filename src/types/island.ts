export interface IslandSoundSettings {
  enabled: boolean;
  soundId: string;
}

export interface IslandSoundSettingsWire {
  enabled: boolean;
  sound_id: string;
}

export interface IslandSoundOption {
  id: string;
  label: string;
  description?: string;
}

export const ISLAND_SOUND_OPTIONS: IslandSoundOption[] = [
  {
    id: "island_default",
    label: "Default chime",
    description: "Bright ding inspired by Apple's Dynamic Island",
  },
  {
    id: "island_soft",
    label: "Loud chime",
    description: "Gentler 660Hz tone with quick fade-out",
  },
];

export function fromWire(payload: IslandSoundSettingsWire): IslandSoundSettings {
  return {
    enabled: payload.enabled,
    soundId: payload.sound_id,
  };
}

export function toWire(settings: IslandSoundSettings): IslandSoundSettingsWire {
  return {
    enabled: settings.enabled,
    sound_id: settings.soundId,
  };
}
