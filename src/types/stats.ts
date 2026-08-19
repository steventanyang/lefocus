export interface StatsApp {
  bundleId: string;
  appName: string | null;
  durationSecs: number;
  iconDataUrl: string | null;
  iconColor: string | null;
}

export interface StatsRange {
  totalDurationSecs: number;
  segmentCount: number;
  apps: StatsApp[];
}

export interface DailyActivity {
  date: string;
  durationSecs: number;
}

export interface AppSessionUsage {
  sessionId: string;
  startedAt: string;
  stoppedAt: string | null;
  status: "Completed" | "Interrupted";
  appDurationSecs: number;
  sessionDurationSecs: number;
}
