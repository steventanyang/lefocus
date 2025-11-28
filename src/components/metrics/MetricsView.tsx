import { useEffect, useState } from "react";
import { useMetrics } from "@/hooks/useMetrics";
import type { CaptureMetrics } from "@/types/metrics";

type MetricsTab = "breakdown" | "history";

export function MetricsView() {
  const { recentCaptures, lastCapture, stats, refreshSnapshot } = useMetrics();
  const [activeTab, setActiveTab] = useState<MetricsTab>("breakdown");

  useEffect(() => {
    refreshSnapshot();
    const interval = setInterval(refreshSnapshot, 2000);
    return () => clearInterval(interval);
  }, [refreshSnapshot]);

  return (
    <div className="w-full max-w-3xl mx-auto h-full flex flex-col">
      {/* Row 1: Averages | Session */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SystemStatsCard recentCaptures={recentCaptures} />
        <SessionStatsCard stats={stats} />
      </div>

      {/* Row 2: Tabbed content (fills remaining space) */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Toggle Switch */}
        <div className="flex justify-start mb-3">
          <div className="inline-flex border border-black">
            <button
              onClick={() => setActiveTab("breakdown")}
              className={`px-4 py-1.5 text-sm transition-all ${
                activeTab === "breakdown"
                  ? "bg-black text-white"
                  : "bg-transparent text-black hover:bg-gray-100"
              }`}
            >
              Capture
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-1.5 text-sm border-l border-black transition-all ${
                activeTab === "history"
                  ? "bg-black text-white"
                  : "bg-transparent text-black hover:bg-gray-100"
              }`}
            >
              History
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === "breakdown" ? (
            <CaptureBreakdown capture={lastCapture} />
          ) : (
            <CaptureHistory captures={recentCaptures} />
          )}
        </div>
      </div>
    </div>
  );
}

function SystemStatsCard({ recentCaptures }: { recentCaptures: CaptureMetrics[] }) {
  const avgCpu = recentCaptures.length > 0 
    ? recentCaptures.reduce((sum, c) => sum + c.cpu_percent, 0) / recentCaptures.length 
    : 0;
  const avgRam = recentCaptures.length > 0 
    ? recentCaptures.reduce((sum, c) => sum + c.memory_mb, 0) / recentCaptures.length 
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Averages</h3>
      {recentCaptures.length > 0 ? (
        <div className="flex justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1">CPU</div>
            <div className="text-xl font-mono font-semibold text-gray-900">{avgCpu.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">RAM</div>
            <div className="text-xl font-mono font-semibold text-gray-900">{avgRam.toFixed(0)}MB</div>
          </div>
        </div>
      ) : (
        <span className="text-gray-400 text-sm">No data</span>
      )}
    </div>
  );
}

function SessionStatsCard({ stats }: { stats: ReturnType<typeof useMetrics>["stats"] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Session</h3>
      {stats ? (
        <div className="flex justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1">Captures</div>
            <div className="text-xl font-mono font-semibold text-gray-900">{stats.captureCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">OCR</div>
            <div className="text-xl font-mono font-semibold text-gray-900">{stats.ocrCount}/{stats.ocrCount + stats.ocrSkipCount}</div>
          </div>
        </div>
      ) : (
        <span className="text-gray-400 text-sm">No data</span>
      )}
    </div>
  );
}

function CaptureBreakdown({ capture }: { capture: CaptureMetrics | null }) {
  if (!capture) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 h-full flex items-center justify-center">
        <span className="text-gray-400 text-sm">No captures yet. Start a timer to begin sensing.</span>
      </div>
    );
  }

  const stages = [
    { label: "Metadata", ms: capture.metadata_ms, color: "#5F7A8A" },
    { label: "Screenshot", ms: capture.screenshot_ms, color: "#6B8E7A" },
    { label: "pHash", ms: capture.phash_ms, color: "#B59E6B" },
    { label: "OCR", ms: capture.ocr_ms ?? 0, color: "#6B5B8A", skipped: capture.ocr_skipped_reason },
    { label: "DB Write", ms: capture.db_write_ms, color: "#B57A6B" },
  ];

  const maxMs = Math.max(...stages.map(s => s.ms), 1);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 h-full flex flex-col">
      {/* Summary row */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-2xl font-mono font-semibold text-gray-900">{capture.total_ms}ms</div>
            <div className="text-xs text-gray-500">Total capture time</div>
          </div>
          <div>
            <div className="text-lg font-mono font-semibold text-gray-900">{capture.cpu_percent.toFixed(1)}%</div>
            <div className="text-xs text-gray-500">CPU usage</div>
          </div>
          <div>
            <div className="text-lg font-mono font-semibold text-gray-900">{capture.memory_mb.toFixed(0)}MB</div>
            <div className="text-xs text-gray-500">Memory</div>
          </div>
          <div>
            <div className="text-lg font-mono font-semibold text-gray-900">{(capture.screenshot_bytes / 1024).toFixed(0)}KB</div>
            <div className="text-xs text-gray-500">Screenshot size</div>
          </div>
        </div>
        <div className="text-xs text-gray-400">
          {new Date(capture.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {/* Timing breakdown */}
      <div className="flex-1 flex flex-col justify-around">
        {stages.map((stage) => (
          <div key={stage.label} className="flex items-center gap-3">
            <div className="w-20 text-sm font-medium text-gray-700">{stage.label}</div>
            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${(stage.ms / maxMs) * 100}%`, backgroundColor: stage.color }}
              />
            </div>
            <span className="text-sm font-mono text-gray-700 w-14 text-right">
              {stage.skipped ? (
                <span className="text-gray-400">-</span>
              ) : (
                `${stage.ms}ms`
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ 
  data, 
  color, 
  label,
  formatValue,
  height = 50,
  id,
}: { 
  data: number[]; 
  color: string; 
  label: string;
  formatValue: (v: number) => string;
  height?: number;
  id: string;
}) {
  if (data.length === 0) return null;
  
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 8;
  const lastValue = data[data.length - 1];

  // Fill the full width - use percentage-based positioning
  const svgWidth = 1000; // Large viewBox for smooth rendering
  const effectiveWidth = svgWidth - padding * 2;
  const pointSpacing = data.length > 1 ? effectiveWidth / (data.length - 1) : effectiveWidth;
  
  // Generate points for line
  const points = data.map((value, i) => {
    const x = padding + i * pointSpacing;
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });
  
  const pointsStr = points.map(p => `${p.x},${p.y}`).join(" ");
  
  // Generate path for gradient fill (closed polygon)
  const areaPath = `M ${points[0].x},${height - padding} ` +
    points.map(p => `L ${p.x},${p.y}`).join(" ") +
    ` L ${points[points.length - 1].x},${height - padding} Z`;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-10 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0 overflow-hidden rounded-lg bg-gray-50">
        <svg 
          viewBox={`0 0 ${svgWidth} ${height}`}
          preserveAspectRatio="none"
          className="w-full block"
          style={{ height }}
        >
          <defs>
            <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          
          {/* Gradient fill */}
          <path
            d={areaPath}
            fill={`url(#gradient-${id})`}
          />
          
          {/* Line */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pointsStr}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <span className="text-base font-mono font-semibold text-gray-900 w-16 text-right flex-shrink-0">
        {formatValue(lastValue)}
      </span>
    </div>
  );
}

function CaptureHistory({ captures }: { captures: CaptureMetrics[] }) {
  if (captures.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 h-full flex items-center justify-center text-gray-400 text-sm">
        No capture history yet. Start a timer to begin sensing.
      </div>
    );
  }

  const timeData = captures.map(c => c.total_ms);
  const cpuData = captures.map(c => c.cpu_percent);
  const ramData = captures.map(c => c.memory_mb);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 h-full flex flex-col">
      <div className="flex-1 flex flex-col justify-around">
        <LineChart 
          id="time"
          data={timeData} 
          color="#8b5cf6" 
          label="Time" 
          formatValue={(v) => `${v}ms`}
          height={85}
        />
        <LineChart 
          id="cpu"
          data={cpuData} 
          color="#f97316" 
          label="CPU" 
          formatValue={(v) => `${v.toFixed(1)}%`}
          height={85}
        />
        <LineChart 
          id="ram"
          data={ramData} 
          color="#14b8a6" 
          label="RAM" 
          formatValue={(v) => `${v.toFixed(0)}MB`}
          height={85}
        />
      </div>
    </div>
  );
}
