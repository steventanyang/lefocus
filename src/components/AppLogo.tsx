/**
 * Reusable component to display app logo
 * Renders custom SVG logo if available, otherwise falls back to colored square with app initial
 */

import { memo } from "react";
import { useAppConfig } from "../hooks/useAppConfigs";
import { getAppColor } from "../lib/appColors";
import { LogoData } from "../types/app-config";

interface AppLogoProps {
  bundleId: string; // Required: stable app identifier
  appName?: string; // Optional: display name for fallback initial
  size?: number; // Default: 32px
  className?: string;
}

export const AppLogo = memo(function AppLogo({
  bundleId,
  appName,
  size = 32,
  className,
}: AppLogoProps) {
  const { data: config } = useAppConfig(bundleId);

  // Parse logoData if it exists
  let logoData: LogoData | undefined;
  if (config?.logoData) {
    try {
      logoData = JSON.parse(config.logoData);
    } catch (e) {
      console.error("Failed to parse logoData for", bundleId, e);
    }
  }

  // Get color for fallback
  const color = getAppColor(bundleId, config);

  // Render custom SVG if logoData exists
  if (logoData) {
    return (
      <svg
        viewBox={logoData.viewBox}
        width={size}
        height={size}
        className={className}
        style={{ display: "block" }}
      >
        {logoData.paths.map((path, i) => (
          <path
            key={i}
            d={path.d}
            stroke={path.stroke}
            strokeWidth={path.strokeWidth}
            fill={path.fill || "none"}
          />
        ))}
      </svg>
    );
  }

  // Fallback: colored square with app initial
  const initial = (appName || bundleId)[0].toUpperCase();
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid black",
        fontSize: Math.floor(size * 0.5),
        fontWeight: "semibold",
        color: "white",
        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
      }}
    >
      {initial}
    </div>
  );
});

