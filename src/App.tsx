import { useState } from "react";
import "./App.css";
import { TimerView } from "@/components/timer/TimerView";
import { ActivitiesView } from "@/components/activities/ActivitiesView";

type View = "timer" | "activities";

function App() {
  const [currentView, setCurrentView] = useState<View>("timer");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      {currentView === "timer" && <TimerView onNavigate={setCurrentView} />}
      {currentView === "activities" && <ActivitiesView onNavigate={setCurrentView} />}
    </main>
  );
}

export default App;
