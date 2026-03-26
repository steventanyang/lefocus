import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CompanionStatus } from "@/types/companion";

const DEFAULT_STATUS: CompanionStatus = {
  active: false,
  joinUrl: null,
  joinPin: null,
  connectedClients: 0,
  port: null,
};

export function useCompanion() {
  const [status, setStatus] = useState<CompanionStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await invoke<CompanionStatus>("get_companion_status");
      setStatus(nextStatus);
    } catch (err) {
      setError(`Failed to get companion status: ${err}`);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status.active) return;
    const interval = setInterval(() => {
      refresh();
    }, 2000);
    return () => clearInterval(interval);
  }, [status.active, refresh]);

  const start = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const nextStatus = await invoke<CompanionStatus>("start_companion_server");
      setStatus(nextStatus);
    } catch (err) {
      setError(`Failed to start phone companion: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      await invoke("stop_companion_server");
      setStatus(DEFAULT_STATUS);
    } catch (err) {
      setError(`Failed to stop phone companion: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const rotatePin = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const nextStatus = await invoke<CompanionStatus>("rotate_companion_pin");
      setStatus(nextStatus);
    } catch (err) {
      setError(`Failed to rotate PIN: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, error, start, stop, rotatePin, refresh };
}
