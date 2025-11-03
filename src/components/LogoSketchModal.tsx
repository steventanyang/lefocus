/**
 * Modal component for drawing custom app logos
 * Features: canvas drawing, pen/eraser tools, color picker, stroke width presets, undo/redo
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { SketchPicker } from "react-color";
import { EditableSvgPath, LogoData } from "../types/app-config";
import {
  toEditablePaths,
  toPersistablePaths,
  convertCanvasToSvg,
  Point,
} from "../lib/canvas-to-svg";
import { useUpsertAppConfig, useDeleteAppConfig } from "../hooks/useAppConfigs";

interface LogoSketchModalProps {
  bundleId: string;
  appName?: string;
  initialLogoData?: LogoData;
  initialColor?: string;
  onSave: () => void;
  onCancel: () => void;
}

type Tool = "pen" | "eraser";
type Action =
  | { type: "add-path"; path: EditableSvgPath }
  | { type: "remove-path"; path: EditableSvgPath }
  | { type: "clear-all"; pathsSnapshot: EditableSvgPath[] };

const MAX_HISTORY = 50;
const ERASER_TOLERANCE = 10; // Pixels tolerance for eraser bounding box detection
const MAX_STROKE_WIDTH = 64; // Maximum stroke width in pixels
const MIN_STROKE_WIDTH = 1; // Minimum stroke width in pixels

export function LogoSketchModal({
  bundleId,
  appName,
  initialLogoData,
  initialColor,
  onSave,
  onCancel,
}: LogoSketchModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(initialColor || "#000000");
  const [strokeWidth, setStrokeWidth] = useState(2.0);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [paths, setPaths] = useState<EditableSvgPath[]>(() =>
    initialLogoData ? toEditablePaths(initialLogoData.paths) : []
  );
  const [pathMap, setPathMap] = useState<Map<number, EditableSvgPath>>(
    new Map()
  );
  const [nextPathId, setNextPathId] = useState(1);
  const [history, setHistory] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);

  const upsertMutation = useUpsertAppConfig();
  const deleteMutation = useDeleteAppConfig();

  // Initialize pathMap and nextPathId from initial paths
  useEffect(() => {
    if (initialLogoData) {
      const editablePaths = toEditablePaths(initialLogoData.paths);
      const map = new Map<number, EditableSvgPath>();
      editablePaths.forEach((path) => {
        map.set(path.id, path);
      });
      setPathMap(map);
      setNextPathId(Math.max(...editablePaths.map((p) => p.id), 0) + 1);
    }
  }, [initialLogoData]);

  const addPath = useCallback((path: EditableSvgPath) => {
    setPaths((prev) => [...prev, path]);
    setPathMap((prev) => {
      const next = new Map(prev);
      next.set(path.id, path);
      return next;
    });
    setHistory((prev) => {
      const action: Action = { type: "add-path", path };
      const next = [...prev, action];
      return next.slice(-MAX_HISTORY);
    });
    setRedoStack([]); // Clear redo stack on new action
  }, []);

  const removePath = useCallback(
    (pathId: number) => {
      const path = pathMap.get(pathId);
      if (!path) return;

      setPaths((prev) => prev.filter((p) => p.id !== pathId));
      setPathMap((prev) => {
        const next = new Map(prev);
        next.delete(pathId);
        return next;
      });
      setHistory((prev) => {
        const action: Action = { type: "remove-path", path };
        const next = [...prev, action];
        return next.slice(-MAX_HISTORY);
      });
      setRedoStack([]);
    },
    [pathMap]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    const lastAction = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));

    // Direct state manipulation without triggering history
    if (lastAction.type === "add-path") {
      setPaths((prev) => prev.filter((p) => p.id !== lastAction.path.id));
      setPathMap((prev) => {
        const next = new Map(prev);
        next.delete(lastAction.path.id);
        return next;
      });
    } else if (lastAction.type === "remove-path") {
      setPaths((prev) => [...prev, lastAction.path]);
      setPathMap((prev) => {
        const next = new Map(prev);
        next.set(lastAction.path.id, lastAction.path);
        return next;
      });
    } else if (lastAction.type === "clear-all") {
      setPaths(lastAction.pathsSnapshot);
      setPathMap(() => {
        const map = new Map();
        lastAction.pathsSnapshot.forEach((p) => map.set(p.id, p));
        return map;
      });
    }

    setRedoStack((prev) => [...prev, lastAction]);
  }, [history]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));

    // Direct state manipulation without triggering history
    if (action.type === "add-path") {
      setPaths((prev) => [...prev, action.path]);
      setPathMap((prev) => {
        const next = new Map(prev);
        next.set(action.path.id, action.path);
        return next;
      });
    } else if (action.type === "remove-path") {
      setPaths((prev) => prev.filter((p) => p.id !== action.path.id));
      setPathMap((prev) => {
        const next = new Map(prev);
        next.delete(action.path.id);
        return next;
      });
    } else if (action.type === "clear-all") {
      setPaths([]);
      setPathMap(new Map());
    }

    setHistory((prev) => [...prev, action]);
  }, [redoStack]);

  // Handle keyboard shortcuts (must be after handleUndo/handleRedo definitions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleClear = useCallback(() => {
    const snapshot = [...paths];
    setPaths([]);
    setPathMap(new Map());
    setHistory((prev) => {
      const action: Action = { type: "clear-all", pathsSnapshot: snapshot };
      const next = [...prev, action];
      return next.slice(-MAX_HISTORY);
    });
    setRedoStack([]);
  }, [paths]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "pen") {
      setIsDrawing(true);
      const point = getCanvasPoint(e);
      setCurrentStroke([point]);
    } else if (tool === "eraser") {
      const point = getCanvasPoint(e);
      // Find paths intersecting with eraser point
      const toRemove: number[] = [];
      paths.forEach((path) => {
        // Simple bounding box check - for v1, remove path if eraser point is near path bounds
        // This is a simplified eraser - full implementation would check actual path intersection
        const pathBounds = getPathBounds(path.d);
        if (
          point.x >= pathBounds.minX - ERASER_TOLERANCE &&
          point.x <= pathBounds.maxX + ERASER_TOLERANCE &&
          point.y >= pathBounds.minY - ERASER_TOLERANCE &&
          point.y <= pathBounds.maxY + ERASER_TOLERANCE
        ) {
          toRemove.push(path.id);
        }
      });
      toRemove.forEach((id) => removePath(id));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || tool !== "pen") return;

    const point = getCanvasPoint(e);
    setCurrentStroke((prev) => [...prev, point]);
  };

  const handleMouseUp = () => {
    if (!isDrawing || tool !== "pen") return;

    if (currentStroke.length > 0) {
      try {
        const svgPath = convertCanvasToSvg(currentStroke, strokeWidth, color);
        const editablePath: EditableSvgPath = {
          ...svgPath,
          id: nextPathId,
        };
        addPath(editablePath);
        setNextPathId((prev) => prev + 1);
      } catch (error) {
        console.error("Failed to convert stroke to SVG:", error);
      }
    }

    setIsDrawing(false);
    setCurrentStroke([]);
  };

  const handleSave = async () => {
    // Validate path count (max 1,000 per design doc)
    if (paths.length > 1000) {
      alert("Too many paths (max 1,000). Please simplify your drawing.");
      return;
    }

    // Validate path data length
    const invalidPath = paths.find((path) => path.d.length > 10000);
    if (invalidPath) {
      alert(
        "Path data too long (max 10,000 chars per path). Please simplify your drawing."
      );
      return;
    }

    const persistablePaths = toPersistablePaths(paths);
    const logoData: LogoData = {
      viewBox: "0 0 64 64",
      paths: persistablePaths,
    };

    console.log("Saving logo:", { bundleId, appName, logoData, color });

    try {
      const result = await upsertMutation.mutateAsync({
        bundleId,
        appName,
        logoData: paths.length > 0 ? logoData : undefined, // Only send logoData if there are paths
        color, // Use current color from modal state, not initialColor
      });
      console.log("Save successful:", result);
      onSave();
    } catch (error) {
      console.error("Failed to save logo:", error);
      alert(`Failed to save logo: ${error}`);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Remove custom logo for ${appName || bundleId}? This will reset to default.`
      )
    ) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(bundleId);
      onSave();
    } catch (error) {
      console.error("Failed to delete logo:", error);
      alert("Failed to delete logo. Please try again.");
    }
  };

  // Draw paths on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all paths
    paths.forEach((path) => {
      ctx.strokeStyle = path.stroke;
      ctx.lineWidth = path.strokeWidth;
      ctx.fillStyle = path.fill || "transparent";
      const path2d = new Path2D(path.d);
      ctx.stroke(path2d);
      if (path.fill) {
        ctx.fill(path2d);
      }
    });

    // Draw current stroke being drawn
    if (currentStroke.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
    }
  }, [paths, currentStroke, color, strokeWidth]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => {
        // Close modal if clicking on backdrop
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="bg-white border border-black p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4">
          Edit Logo: {appName || bundleId}
        </h2>

        <div className="flex gap-6">
          {/* Canvas */}
          <div className="flex-1">
            <canvas
              ref={canvasRef}
              width={512}
              height={512}
              className="border border-black cursor-crosshair"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ touchAction: "none" }}
            />
          </div>

          {/* Controls */}
          <div className="w-64 flex flex-col gap-4">
            {/* Tool selection */}
            <div>
              <div className="text-sm font-medium mb-2">Tool</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTool("pen")}
                  className={`px-4 py-2 border border-black ${
                    tool === "pen"
                      ? "bg-black text-white"
                      : "bg-white text-black"
                  }`}
                >
                  Pen
                </button>
                <button
                  onClick={() => setTool("eraser")}
                  className={`px-4 py-2 border border-black ${
                    tool === "eraser"
                      ? "bg-black text-white"
                      : "bg-white text-black"
                  }`}
                >
                  Eraser
                </button>
              </div>
            </div>

            {/* Color picker */}
            <div>
              <div className="text-sm font-medium mb-2">Color</div>
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="w-full h-10 border border-black"
                  style={{ backgroundColor: color }}
                />
                {showColorPicker && (
                  <div className="absolute z-10 mt-2">
                    <div
                      className="fixed inset-0"
                      onClick={() => setShowColorPicker(false)}
                    />
                    <SketchPicker
                      color={color}
                      onChange={(color) => setColor(color.hex)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Stroke width */}
            <div>
              <div className="text-sm font-medium mb-2">
                Stroke Width: {strokeWidth.toFixed(0)}px
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={MIN_STROKE_WIDTH}
                  max={MAX_STROKE_WIDTH}
                  step={1}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-10 text-right">
                  {strokeWidth.toFixed(0)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                className="px-4 py-2 border border-black bg-white text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Undo (Cmd+Z)
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="px-4 py-2 border border-black bg-white text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Redo (Cmd+Shift+Z)
              </button>
              <button
                onClick={handleClear}
                disabled={paths.length === 0}
                className="px-4 py-2 border border-black bg-white text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All
              </button>
            </div>

            {/* Preview */}
            <div>
              <div className="text-sm font-medium mb-2">Preview</div>
              <div className="w-16 h-16 border border-black flex items-center justify-center">
                {paths.length > 0 ? (
                  <svg viewBox="0 0 64 64" width={64} height={64}>
                    {paths.map((path, i) => (
                      <path
                        key={i}
                        d={path.d}
                        stroke={path.stroke}
                        strokeWidth={path.strokeWidth}
                        fill={path.fill || "none"}
                      />
                    ))}
                  </svg>
                ) : (
                  <span className="text-gray-400 text-xs">No logo</span>
                )}
              </div>
            </div>

            {/* Save/Cancel */}
            <div className="flex flex-col gap-2 mt-auto">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Save button clicked");
                  handleSave();
                }}
                disabled={upsertMutation.isPending}
                className="px-4 py-2 border border-black bg-black text-white disabled:opacity-50"
              >
                {upsertMutation.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 border border-black bg-white text-black"
              >
                Cancel
              </button>
              {initialLogoData && (
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 border border-red-600 bg-white text-red-600 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete Logo"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to get bounding box of SVG path
function getPathBounds(pathD: string): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const commands = pathD.match(/[ML][\d.-]+/g) || [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  commands.forEach((cmd) => {
    const coords = cmd.match(/[\d.-]+/g) || [];
    for (let i = 0; i < coords.length; i += 2) {
      const x = parseFloat(coords[i]);
      const y = parseFloat(coords[i + 1]);
      if (!isNaN(x) && !isNaN(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  });

  return {
    minX: isFinite(minX) ? minX : 0,
    minY: isFinite(minY) ? minY : 0,
    maxX: isFinite(maxX) ? maxX : 64,
    maxY: isFinite(maxY) ? maxY : 64,
  };
}
