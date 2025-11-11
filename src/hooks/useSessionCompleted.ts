import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import type { SessionInfo } from "@/types/timer";

type SessionCompletedPayload = {
  session_id: string;
  session: SessionInfo;
};

/**
 * Hook to listen for session completed events and update query cache
 * Returns the completed session if one was received
 */
export function useSessionCompleted(): SessionInfo | null {
  const queryClient = useQueryClient();
  const [completedSession, setCompletedSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    const unlistenPromise = listen<SessionCompletedPayload>(
      "session-completed",
      (event) => {
        setCompletedSession(event.payload.session);
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
      }
    );

    return () => {
      unlistenPromise
        .then((unlisten) => unlisten())
        .catch(() => {
          /* ignore */
        });
    };
  }, [queryClient]);

  return completedSession;
}

