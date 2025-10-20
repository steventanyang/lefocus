import { useState } from "react";
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

  return (
    <main className="container">
      <h1>LeFocus Swift Plugin Test</h1>
      <p style={{ fontSize: "0.9em", color: "#666", marginBottom: "2rem" }}>
        Phase 1: Testing macOS capture backend
      </p>

      <div className="controls">
        <div className="button-group" style={{ gap: "1rem", marginBottom: "1.5rem" }}>
          <button onClick={handleGetWindow} className="btn-primary" disabled={!!loading}>
            1. Get Active Window
          </button>
          <button
            onClick={handleCaptureScreenshot}
            className="btn-primary"
            disabled={!windowMetadata || !!loading}
          >
            2. Capture Screenshot
          </button>
          <button
            onClick={handleRunOCR}
            className="btn-primary"
            disabled={!screenshotStatus || !!loading}
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
            <div style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px" }}>
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
