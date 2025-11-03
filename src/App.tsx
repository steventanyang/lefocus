import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./App.css";
import { TimerView } from "./components/TimerView";
import { ActivitiesView } from "./components/ActivitiesView";
import { AppConfigSettings } from "./pages/AppConfigSettings";

type View = "timer" | "activities" | "settings";

// Create React Query client with default options
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const [currentView, setCurrentView] = useState<View>("timer");

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        {currentView === "timer" && <TimerView onNavigate={setCurrentView} />}
        {currentView === "activities" && <ActivitiesView onNavigate={setCurrentView} />}
        {currentView === "settings" && <AppConfigSettings onNavigate={setCurrentView} />}
      </main>
    </QueryClientProvider>
  );
}

export default App;
