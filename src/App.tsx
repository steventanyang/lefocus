import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface WindowMetadata {
  window_id: number;
  bundle_id: string;
  title: string;
  owner_name: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface OCRResult {
  text: string;
  confidence: number;
  word_count: number;
}

function App() {
  const [windowMetadata, setWindowMetadata] = useState<WindowMetadata | null>(null);
  const [screenshotStatus, setScreenshotStatus] = useState<string>("");
  const [ocrResult, setOCRResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<string>("");
  const [isAutoLooping, setIsAutoLooping] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const intervalRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  async function handleGetWindow() {
    setError("");
    setLoading("Getting active window...");
    try {
      const result = await invoke<WindowMetadata>("test_get_window");
      setWindowMetadata(result);
      setScreenshotStatus("");
      setOCRResult(null);
    } catch (err) {
      setError(`Failed to get window: ${err}`);
      setWindowMetadata(null);
    } finally {
      setLoading("");
    }
  }

  async function handleCaptureScreenshot() {
    if (!windowMetadata) {
      setError("Please get window metadata first");
      return;
    }

    setError("");
    setLoading("Capturing screenshot...");
    try {
      const result = await invoke<string>("test_capture_screenshot", {
        windowId: windowMetadata.window_id,
      });
      setScreenshotStatus(result);
      setOCRResult(null);
    } catch (err) {
      setError(`Failed to capture screenshot: ${err}`);
      setScreenshotStatus("");
    } finally {
      setLoading("");
    }
  }

  async function handleRunOCR() {
    if (!screenshotStatus) {
      setError("Please capture a screenshot first");
      return;
    }

    setError("");
    setLoading("Running OCR...");
    try {
      const result = await invoke<OCRResult>("test_run_ocr", {
        imagePath: "/tmp/lefocus_test_screenshot.png",
      });
      setOCRResult(result);
    } catch (err) {
      setError(`Failed to run OCR: ${err}`);
      setOCRResult(null);
    } finally {
      setLoading("");
    }
  }

  async function runFullPipeline() {
    try {
      // Step 1: Get window
      setError("");
      setLoading("Getting active window...");
      const metadata = await invoke<WindowMetadata>("test_get_window");
      setWindowMetadata(metadata);

      // Step 2: Capture screenshot
      setLoading("Capturing screenshot...");
      const screenshotMsg = await invoke<string>("test_capture_screenshot", {
        windowId: metadata.window_id,
      });
      setScreenshotStatus(screenshotMsg);

      // Step 3: Run OCR
      setLoading("Running OCR...");
      const ocr = await invoke<OCRResult>("test_run_ocr", {
        imagePath: "/tmp/lefocus_test_screenshot.png",
      });
      setOCRResult(ocr);
      setLoading("");
    } catch (err) {
      setError(`Pipeline failed: ${err}`);
      setLoading("");
    }
  }

  function toggleAutoLoop() {
    if (isAutoLooping) {
      // Stop the loop
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setIsAutoLooping(false);
      setCountdown(5);
    } else {
      // Start the loop
      setIsAutoLooping(true);
      runFullPipeline(); // Run immediately
      setCountdown(5);

      // Run every 5 seconds
      intervalRef.current = window.setInterval(() => {
        runFullPipeline();
        setCountdown(5);
      }, 5000);

      // Countdown timer
      countdownRef.current = window.setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 5));
      }, 1000);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  return (
    <main className="container">
      <h1>LeFocus Swift Plugin Test</h1>
      <p style={{ fontSize: "0.9em", color: "#666", marginBottom: "2rem" }}>
        Phase 1: Testing macOS capture backend
      </p>

      <div className="controls">
        <div style={{ marginBottom: "1.5rem" }}>
          <button
            onClick={toggleAutoLoop}
            className={isAutoLooping ? "btn-danger" : "btn-primary"}
            style={{ fontSize: "1.1em", padding: "0.75rem 1.5rem" }}
          >
            {isAutoLooping ? `Stop Auto Loop (next in ${countdown}s)` : "Start Auto Loop (5s)"}
          </button>
        </div>

        <div className="button-group" style={{ gap: "1rem", marginBottom: "1.5rem" }}>
          <button onClick={handleGetWindow} className="btn-primary" disabled={!!loading || isAutoLooping}>
            1. Get Active Window
          </button>
          <button
            onClick={handleCaptureScreenshot}
            className="btn-primary"
            disabled={!windowMetadata || !!loading || isAutoLooping}
          >
            2. Capture Screenshot
          </button>
          <button
            onClick={handleRunOCR}
            className="btn-primary"
            disabled={!screenshotStatus || !!loading || isAutoLooping}
          >
            3. Run OCR
          </button>
        </div>

        {loading && (
          <div className="message" style={{ background: "#e3f2fd", color: "#1976d2" }}>
            {loading}
          </div>
        )}

        {error && (
          <div className="message" style={{ background: "#ffebee", color: "#c62828" }}>
            {error}
          </div>
        )}

        {windowMetadata && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1em", marginBottom: "0.5rem" }}>Window Metadata:</h3>
            <pre
              style={{
                background: "#f5f5f5",
                padding: "1rem",
                borderRadius: "4px",
                overflow: "auto",
                fontSize: "0.85em",
                color: "#000",
              }}
            >
              {JSON.stringify(windowMetadata, null, 2)}
            </pre>
          </div>
        )}

        {screenshotStatus && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1em", marginBottom: "0.5rem" }}>Screenshot:</h3>
            <div className="message" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
              {screenshotStatus}
            </div>
          </div>
        )}

        {ocrResult && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1em", marginBottom: "0.5rem" }}>OCR Result:</h3>
            <div style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px", color: "#000" }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <strong>Confidence:</strong> {(ocrResult.confidence * 100).toFixed(1)}%
              </div>
              <div style={{ marginBottom: "0.5rem" }}>
                <strong>Word Count:</strong> {ocrResult.word_count}
              </div>
              <div>
                <strong>Text:</strong>
                <pre
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.75rem",
                    background: "white",
                    borderRadius: "4px",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.85em",
                    color: "#000",
                  }}
                >
                  {ocrResult.text || "(empty)"}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
