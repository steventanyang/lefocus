import { useState, useEffect, useMemo } from "react";
import "./App.css";
import { TimerView } from "@/components/timer/TimerView";
import { ActivitiesView } from "@/components/activities/ActivitiesView";
import { StatsView } from "@/components/stats/StatsView";
import { ProfileView } from "@/components/profile/ProfileView";
import { OnboardingView } from "@/components/onboarding/OnboardingView";
import { MetricsView } from "@/components/metrics/MetricsView";
import {
  GridOverlay,
  useGridOverlay,
  type GridLines,
} from "@/components/ui/GridOverlay";
import { useWindowSize } from "@/hooks/useWindowSize";
import { useGlobalNavigationShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePermissions } from "@/hooks/usePermissions";
import { isUserTyping, isMac } from "@/utils/keyboardUtils";
import { FONT_CLASSES } from "@/constants/fonts";

type View =
  | "timer"
  | "activities"
  | "stats"
  | "profile"
  | "onboarding"
  | "metrics";

const ONBOARDING_COMPLETED_KEY = "lefocus_onboarding_completed";

function App() {
  const [currentView, setCurrentView] = useState<View>("timer");
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(
    () => {
      // Check localStorage on initial render
      return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true";
    }
  );
  const { width, height } = useWindowSize();
  const { loading: permissionsLoading } = usePermissions();
  const { showGrid } = useGridOverlay();

  // Generate grid lines based on current view and window size
  const gridLines = useMemo((): GridLines => {
    const centerX = width / 2;
    const centerY = height / 2;
    const contentWidth = 448; // max-w-md
    const halfContent = contentWidth / 2;

    if (currentView === "timer") {
      return {
        vertical: [
          32, // left-8 (mode buttons, nav buttons, bottom controls)
          width - 32, // right-8 (label, start button)
          width - 32 - 160, // left edge of start button (w-[160px])
          centerX - halfContent, // content left edge
          centerX, // center
          centerX + halfContent, // content right edge
        ],
        horizontal: [
          32, // top-8 (mode buttons, label section)
          208, // top-52 (navigation buttons)
          height - 32, // bottom-8 (bottom controls)
          centerY, // vertical center
          centerY + 64 + 36,
          centerY + 64 + 36 - 50,
        ],
      };
    }

    if (currentView === "activities") {
      const maxW3xl = 768; // max-w-3xl
      return {
        vertical: [
          centerX - maxW3xl / 2, // content left
          centerX + maxW3xl / 2, // content right
        ],
        horizontal: [
          32, // top padding
        ],
      };
    }

    if (currentView === "stats") {
      const maxW3xl = 768; // max-w-3xl
      const contentLeft = centerX - maxW3xl / 2;
      const contentRight = centerX + maxW3xl / 2;
      const padding = 24; // p-6
      return {
        vertical: [
          contentLeft, // content left edge
          contentLeft + padding, // inner padding left
          contentRight - padding, // inner padding right
          contentRight, // content right edge
        ],
        horizontal: [
          32, // top padding (p-8)
          32 + 32 + 32, // gap-8 between header and content
          32 + 32 + 32 + padding, // content inner top (p-6)
          32 + 32 + 32 + padding + 24 + 32, // after date + duration section
          32 + 32 + 32 + padding + 24 + 32 + 24, // after "top applications" header
        ],
      };
    }

    // Default grid
    return {
      vertical: [32, centerX, width - 32],
      horizontal: [32, centerY, height - 32],
    };
  }, [currentView, width, height]);

  // Apply saved font on app startup
  useEffect(() => {
    const savedFont = localStorage.getItem("selectedFont");
    // Handle migration from old "system" preference
    const fontId =
      savedFont === "system" ||
      savedFont === "noto-sans-jp" ||
      savedFont === "ibm-plex-mono"
        ? "ibm-plex-sans"
        : savedFont;

    if (fontId && FONT_CLASSES[fontId]) {
      const root = document.documentElement;
      // Remove any existing font classes
      Object.values(FONT_CLASSES).forEach((cls) => root.classList.remove(cls));
      // Apply the saved font
      root.classList.add(FONT_CLASSES[fontId]);
    }
  }, []);

  // Set up global navigation shortcuts (work from anywhere)
  useGlobalNavigationShortcuts(
    () => setCurrentView("activities"),
    () => setCurrentView("timer"),
    () => setCurrentView("stats"),
    () => setCurrentView("profile")
  );

  // Cmd+5 for metrics view
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isUserTyping()) return;
      const modifier = isMac() ? event.metaKey : event.ctrlKey;
      if (modifier && event.key === "5") {
        event.preventDefault();
        setCurrentView("metrics");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Show onboarding only on first launch:
  // - After permissions have finished loading
  // - And onboarding hasn't been completed before (stored in localStorage)
  const shouldShowOnboarding = !permissionsLoading && !onboardingCompleted;

  // Timer view should be centered, other views should be scrollable from top
  const isTimerView = currentView === "timer";

  const handleReload = () => {
    window.location.reload();
  };

  const handleOnboardingComplete = () => {
    // Save to localStorage so onboarding doesn't show on next launch
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    setOnboardingCompleted(true);
  };

  // Show onboarding if needed, otherwise show the requested view
  if (shouldShowOnboarding) {
    return (
      <main
        className="flex-1 flex flex-col p-8 bg-white items-center justify-center"
        style={{ height: height > 0 ? `${height}px` : "100vh" }}
      >
        <OnboardingView
          onReload={handleReload}
          onComplete={handleOnboardingComplete}
        />
      </main>
    );
  }

  return (
    <>
      {showGrid && <GridOverlay lines={gridLines} />}
      <main
        className={`flex-1 flex flex-col p-8 bg-white ${
          isTimerView
            ? "items-center justify-center"
            : "items-center justify-start overflow-y-auto"
        }`}
        style={{ height: height > 0 ? `${height}px` : "100vh" }}
      >
        {currentView === "timer" && <TimerView onNavigate={setCurrentView} />}
        {currentView === "activities" && (
          <ActivitiesView onNavigate={setCurrentView} />
        )}
        {currentView === "stats" && <StatsView onNavigate={setCurrentView} />}
        {currentView === "profile" && (
          <ProfileView
            onNavigate={setCurrentView}
            onClose={() => setCurrentView("timer")}
          />
        )}
        {currentView === "metrics" && <MetricsView />}
      </main>
    </>
  );
}

export default App;
