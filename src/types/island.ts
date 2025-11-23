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
    label: "default 1",
    description: "Bright ding inspired by Apple's Dynamic Island",
  },
  {
    id: "island_soft",
    label: "default 2",
    description: "Gentler 660Hz tone with quick fade-out",
  },
  {
    id: "island_elevator",
    label: "elevator ding",
    description: "Classic clear bell tone",
  },
  {
    id: "island_404",
    label: "error 404",
    description: "Glitchy system error sound",
  },
  {
    id: "island_runaway",
    label: "ye",
    description: "Iconic high E piano note",
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
