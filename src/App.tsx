import { useState } from "react";
import "./App.css";
import { TimerView } from "@/components/timer/TimerView";
import { ActivitiesView } from "@/components/activities/ActivitiesView";
import { StatsView } from "@/components/stats/StatsView";
import { ProfileView } from "@/components/profile/ProfileView";
import { OnboardingView } from "@/components/onboarding/OnboardingView";
import { useWindowSize } from "@/hooks/useWindowSize";
import { useGlobalNavigationShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePermissions } from "@/hooks/usePermissions";

type View = "timer" | "activities" | "stats" | "profile" | "onboarding";

function App() {
  const [currentView, setCurrentView] = useState<View>("timer");
  const { height } = useWindowSize();
  const { loading: permissionsLoading, allPermissionsGranted } = usePermissions();

  // Set up global navigation shortcuts (work from anywhere)
  useGlobalNavigationShortcuts(
    () => setCurrentView("activities"),
    () => setCurrentView("timer"),
    () => setCurrentView("stats"),
    () => setCurrentView("profile")
  );

  // Show onboarding if permissions are not granted (and we've finished loading)
  const shouldShowOnboarding = !permissionsLoading && !allPermissionsGranted;
  
  // Timer view should be centered, other views should be scrollable from top
  const isTimerView = currentView === "timer";

  const handleReload = () => {
    window.location.reload();
  };

  // Show onboarding if needed, otherwise show the requested view
  if (shouldShowOnboarding) {
    return (
      <main
        className="flex-1 flex flex-col p-8 bg-white items-center justify-center"
        style={{ height: height > 0 ? `${height}px` : "100vh" }}
      >
        <OnboardingView onReload={handleReload} />
      </main>
    );
  }

  return (
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
      {currentView === "stats" && (
        <StatsView onNavigate={setCurrentView} />
      )}
      {currentView === "profile" && (
        <ProfileView
          onNavigate={setCurrentView}
          onClose={() => setCurrentView("timer")}
        />
      )}
    </main>
  );
}

export default App;
