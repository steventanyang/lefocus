import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type SoundType = "Binaural" | "BrownNoise" | "Rain";

function App() {
  const [soundType, setSoundType] = useState<SoundType>("Binaural");
  const [leftFreq, setLeftFreq] = useState(200);
  const [rightFreq, setRightFreq] = useState(204);
  const [volume, setVolume] = useState(0.5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [message, setMessage] = useState("");

  async function startAudio() {
    try {
      const result = await invoke<string>("start_audio", {
        soundType,
        leftFreq: soundType === "Binaural" ? leftFreq : null,
        rightFreq: soundType === "Binaural" ? rightFreq : null,
      });
      setMessage(result);
      setIsPlaying(true);
      setIsPaused(false);

      // Set initial volume
      await invoke("set_volume", { volume });
    } catch (error) {
      setMessage(`Error: ${error}`);
    }
  }

  async function stopAudio() {
    try {
      const result = await invoke<string>("stop_audio");
      setMessage(result);
      setIsPlaying(false);
      setIsPaused(false);
    } catch (error) {
      setMessage(`Error: ${error}`);
    }
  }

  async function togglePause() {
    try {
      const paused = await invoke<boolean>("toggle_pause");
      setIsPaused(paused);
      setMessage(paused ? "Paused" : "Playing");
    } catch (error) {
      setMessage(`Error: ${error}`);
    }
  }

  async function handleVolumeChange(newVolume: number) {
    setVolume(newVolume);
    if (isPlaying) {
      try {
        await invoke("set_volume", { volume: newVolume });
      } catch (error) {
        setMessage(`Error: ${error}`);
      }
    }
  }

  return (
    <main className="container">
      <h1>LeFocus Audio MVP</h1>

      <div className="controls">
        <div className="control-group">
          <label>Sound Type:</label>
          <select
            value={soundType}
            onChange={(e) => setSoundType(e.target.value as SoundType)}
            disabled={isPlaying}
          >
            <option value="Binaural">Binaural Beats</option>
            <option value="Rain">Rain Sounds</option>
            <option value="BrownNoise">Brown Noise</option>
          </select>
        </div>

        {soundType === "Binaural" && (
          <div className="frequency-controls">
            <div className="control-group">
              <label>Left Ear Frequency: {leftFreq} Hz</label>
              <input
                type="range"
                min="100"
                max="800"
                value={leftFreq}
                onChange={(e) => setLeftFreq(Number(e.target.value))}
                disabled={isPlaying}
              />
            </div>
            <div className="control-group">
              <label>Right Ear Frequency: {rightFreq} Hz</label>
              <input
                type="range"
                min="100"
                max="800"
                value={rightFreq}
                onChange={(e) => setRightFreq(Number(e.target.value))}
                disabled={isPlaying}
              />
            </div>
            <div className="beat-frequency">
              <small>Beat Frequency: {Math.abs(rightFreq - leftFreq)} Hz</small>
            </div>
          </div>
        )}

        <div className="control-group">
          <label>Volume: {Math.round(volume * 100)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
          />
        </div>

        <div className="button-group">
          {!isPlaying ? (
            <button onClick={startAudio} className="btn-primary">
              Play
            </button>
          ) : (
            <>
              <button onClick={togglePause} className="btn-secondary">
                {isPaused ? "Resume" : "Pause"}
              </button>
              <button onClick={stopAudio} className="btn-danger">
                Stop
              </button>
            </>
          )}
        </div>

        {message && <div className="message">{message}</div>}
      </div>
    </main>
  );
}

export default App;
