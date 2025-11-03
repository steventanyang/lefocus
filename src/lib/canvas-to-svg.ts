/**
 * Canvas-to-SVG conversion utilities
 * Uses perfect-freehand for stroke generation and Douglas-Peucker for path simplification
 */

import { getStroke } from "perfect-freehand";
import simplify from "simplify-js";
import { SvgPath, EditableSvgPath } from "../types/app-config";

export interface Point {
  x: number;
  y: number;
}

/**
 * Convert persisted SvgPath[] to editable paths with IDs
 */
export function toEditablePaths(paths: SvgPath[]): EditableSvgPath[] {
  return paths.map((path, index) => ({ ...path, id: index + 1 }));
}

/**
 * Convert editable paths to persistable format (strip IDs)
 */
export function toPersistablePaths(paths: EditableSvgPath[]): SvgPath[] {
  return paths.map(({ id, ...path }) => path);
}

/**
 * Simplify path using Douglas-Peucker algorithm
 * @param points Array of points to simplify
 * @param epsilon Maximum distance for simplification (default: 0.5)
 * @returns Simplified array of points
 */
export function simplifyPath(points: Point[], epsilon: number = 0.5): Point[] {
  if (points.length <= 2) return points;

  // Convert to format expected by simplify-js
  const simplified = simplify(
    points.map((p: Point) => ({ x: p.x, y: p.y })),
    epsilon,
    true
  );

  return simplified.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));
}

/**
 * Convert canvas stroke coordinates to SVG path using perfect-freehand
 * @param coordinates Array of pointer coordinates during drawing
 * @param strokeWidth Stroke width in pixels
 * @param color Stroke color (hex format)
 * @returns SVG path object
 */
export function convertCanvasToSvg(
  coordinates: Point[],
  strokeWidth: number,
  color: string
): SvgPath {
  if (coordinates.length === 0) {
    throw new Error("Cannot convert empty coordinates to SVG path");
  }

  // Generate smooth stroke using perfect-freehand
  const strokePoints = getStroke(coordinates, {
    size: strokeWidth,
    thinning: 0.5, // Moderate pressure simulation
    smoothing: 0.5, // Balanced between accuracy and smoothness
    streamline: 0.5, // Reduce jitter
  });

  // Convert to Point[] format
  const pointArray: Point[] = strokePoints.map((p: number[]) => ({
    x: p[0],
    y: p[1],
  }));

  // Simplify path using Douglas-Peucker algorithm
  const simplifiedPoints = simplifyPath(pointArray, 0.5);

  // Convert to SVG path string
  if (simplifiedPoints.length === 0) {
    throw new Error("Simplified path is empty");
  }

  // Start with moveTo command
  let pathString = `M ${simplifiedPoints[0].x} ${simplifiedPoints[0].y}`;

  // Add lineTo commands for remaining points
  for (let i = 1; i < simplifiedPoints.length; i++) {
    pathString += ` L ${simplifiedPoints[i].x} ${simplifiedPoints[i].y}`;
  }

  // Close path if needed (optional - can be added later if fill support is needed)
  // pathString += " Z";

  return {
    d: pathString,
    stroke: color,
    strokeWidth: strokeWidth,
    fill: undefined, // v1 does not support fill
  };
}
