import { useEffect, useState } from "react";
import { useIslandSoundSettings } from "@/hooks/useIslandSoundSettings";
import { KeyBox } from "@/components/ui/KeyBox";
import { isUserTyping } from "@/utils/keyboardUtils";

export function ChimeSettingsPage() {
  const {
    settings,
    isLoading,
    isSaving,
    error,
    setError,
    options,
    updateSettings,
    previewSound,
  } = useIslandSoundSettings();

  const [userSelectedIndex, setUserSelectedIndex] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "playing" | "success" | "error">("idle");
  const [prevSoundId, setPrevSoundId] = useState<string | null>(null);

  // Calculate default selected index during render (current sound)
  const defaultSelectedIndex =
    settings && !isLoading
      ? (() => {
          const idx = options.findIndex((o) => o.id === settings.soundId);
          return idx >= 0 ? idx : 0;
        })()
      : null;

  // Reset user selection when current sound changes externally (adjust during render pattern)
  if (settings && prevSoundId !== settings.soundId) {
    setPrevSoundId(settings.soundId);
    // Reset user selection so it follows the new current sound
    if (userSelectedIndex !== null) {
      setUserSelectedIndex(null);
    }
  }

  // Effective selected index: user selection or default (calculated during render)
  const selectedIndex = userSelectedIndex !== null ? userSelectedIndex : defaultSelectedIndex;

  // Keyboard shortcuts - synchronizing with external system (window keyboard events)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isUserTyping()) return;

      // Calculate current effective selection
      const currentDefaultIndex =
        settings && !isLoading
          ? (() => {
              const idx = options.findIndex((o) => o.id === settings.soundId);
              return idx >= 0 ? idx : 0;
            })()
          : null;
      const currentSelectedIndex = userSelectedIndex !== null ? userSelectedIndex : currentDefaultIndex;

      // T key: Toggle enabled/disabled
      if ((event.key === "t" || event.key === "T") && settings) {
        event.preventDefault();
        updateSettings({ ...settings, enabled: !settings.enabled }).catch(() => {
          // error handled in hook
        });
        return;
      }

      // Number keys 1-8: Jump to sound by index
      const num = parseInt(event.key);
      if (num >= 1 && num <= 8) {
        event.preventDefault();
        const soundIndex = num - 1;
        if (soundIndex < options.length) {
          setUserSelectedIndex(soundIndex);
          // Also select the sound if it's different from current
          if (settings && options[soundIndex].id !== settings.soundId) {
            updateSettings({ ...settings, soundId: options[soundIndex].id }).catch(() => {
              // error handled in hook
            });
          }
        }
        return;
      }

      // P key: Preview selected sound
      if ((event.key === "p" || event.key === "P") && currentSelectedIndex !== null) {
        event.preventDefault();
        const selectedSound = options[currentSelectedIndex];
        if (selectedSound && previewState !== "playing") {
          setPreviewState("playing");
          setError(null);
          previewSound(selectedSound.id)
            .then(() => {
              setPreviewState("success");
              setTimeout(() => setPreviewState("idle"), 800);
            })
            .catch(() => {
              setTimeout(() => setPreviewState("idle"), 100);
            });
        }
        return;
      }

      // Arrow keys: navigate list and immediately select
      if (event.key === "ArrowUp" && settings) {
        event.preventDefault();
        setUserSelectedIndex((prev) => {
          const current = prev !== null ? prev : currentDefaultIndex ?? 0;
          const newIndex = Math.max(0, current - 1);
          const newSound = options[newIndex];
          if (newSound && newSound.id !== settings.soundId) {
            updateSettings({ ...settings, soundId: newSound.id }).catch(() => {
              // error handled in hook
            });
          }
          return newIndex;
        });
      } else if (event.key === "ArrowDown" && settings) {
        event.preventDefault();
        setUserSelectedIndex((prev) => {
          const current = prev !== null ? prev : currentDefaultIndex ?? 0;
          const newIndex = Math.min(options.length - 1, current + 1);
          const newSound = options[newIndex];
          if (newSound && newSound.id !== settings.soundId) {
            updateSettings({ ...settings, soundId: newSound.id }).catch(() => {
              // error handled in hook
            });
          }
          return newIndex;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings, userSelectedIndex, options, previewSound, previewState, updateSettings, setError, isLoading]);

  if (isLoading && !settings) {
    return <div className="text-gray-500">Loading completion chime settings...</div>;
  }

  const disabled = !settings || isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-normal">Completion chimes</h2>
        </div>
        <button
          disabled={disabled || isSaving}
          onClick={() => {
            if (!settings) return;
            updateSettings({ ...settings, enabled: !settings.enabled }).catch(() => {
              // error handled in hook
            });
          }}
          className={`flex items-center gap-2 text-gray-600 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <KeyBox hovered={false} selected={settings?.enabled ?? false}>T</KeyBox>
          <span className="text-sm">{settings?.enabled ? "Turn off" : "Turn on"}</span>
        </button>
      </div>

      {/* Sounds list */}
      <div className="flex flex-col gap-3">
        {options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCurrent = settings?.soundId === option.id;

          return (
            <div key={option.id} className="flex items-center gap-2" style={{ height: "34px" }}>
              {/* Number indicator */}
              <KeyBox selected={isSelected} hovered={false}>
                {index + 1}
              </KeyBox>

              {/* Sound option */}
              <div
                className="flex cursor-pointer flex-1"
                onClick={() => {
                  setUserSelectedIndex(index);
                  if (settings && option.id !== settings.soundId) {
                    updateSettings({ ...settings, soundId: option.id }).catch(() => {
                      // error handled in hook
                    });
                  }
                }}
              >
                <div
                  className={`border px-3 py-1 text-sm font-medium transition-opacity flex items-center justify-center min-w-0 ${
                    isSelected || isCurrent ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300 opacity-60"
                  } hover:opacity-100 hover:bg-black hover:text-white hover:border-black`}
                  style={{ width: "200px" }}
                >
                  <span className="truncate inline-block max-w-full text-left">{option.label}</span>
                </div>

                {/* Actions - only show when selected */}
                {isSelected && (
                  <div className="flex items-center justify-center px-2 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (previewState !== "playing") {
                          setPreviewState("playing");
                          setError(null);
                          previewSound(option.id)
                            .then(() => {
                              setPreviewState("success");
                              setTimeout(() => setPreviewState("idle"), 800);
                            })
                            .catch(() => {
                              setTimeout(() => setPreviewState("idle"), 100);
                            });
                        }
                      }}
                      disabled={previewState === "playing"}
                      className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-black disabled:opacity-50"
                    >
                      <KeyBox selected={previewState === "success" && isSelected}>P</KeyBox>
                      <span>{previewState === "playing" && isSelected ? "Playing..." : "Preview"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={() => {
              setError(null);
            }}
            className="underline text-red-700/80"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
