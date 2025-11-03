/**
 * Settings page for managing app configurations
 * Lists all detected apps with options to edit logos and colors
 */

import { useState, useMemo } from "react";
import { useDetectedApps, useAllAppConfigs } from "../hooks/useAppConfigs";
import { AppLogo } from "../components/AppLogo";
import { LogoSketchModal } from "../components/LogoSketchModal";
import { AppConfig, LogoData } from "../types/app-config";

interface AppConfigSettingsProps {
  onNavigate: (view: "timer" | "activities" | "settings") => void;
}

export function AppConfigSettings({ onNavigate }: AppConfigSettingsProps) {
  const { data: apps = [], isLoading: appsLoading } = useDetectedApps();
  const { data: configs = [], isLoading: configsLoading } = useAllAppConfigs();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);

  // Merge apps with configs
  const appList = useMemo(() => {
    return apps.map((app) => ({
      bundleId: app.bundleId,
      appName: app.appName,
      config: configs.find((c) => c.bundleId === app.bundleId),
    }));
  }, [apps, configs]);

  // Filter apps based on search query
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return appList;

    const query = searchQuery.toLowerCase();
    return appList.filter(
      (app) =>
        app.appName?.toLowerCase().includes(query) ||
        app.bundleId.toLowerCase().includes(query)
    );
  }, [appList, searchQuery]);

  const isLoading = appsLoading || configsLoading;

  // Get initial logo data for editing
  const getInitialLogoData = (bundleId: string): LogoData | undefined => {
    const config = configs.find((c) => c.bundleId === bundleId);
    if (!config?.logoData) return undefined;

    try {
      return JSON.parse(config.logoData);
    } catch (e) {
      console.error("Failed to parse logoData:", e);
      return undefined;
    }
  };

  const handleSave = () => {
    setEditingBundleId(null);
  };

  const editingApp = editingBundleId
    ? appList.find((app) => app.bundleId === editingBundleId)
    : null;

  return (
    <div className="w-full max-w-4xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">
          App Configurations
        </h1>
        <button
          className="text-sm font-light border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors"
          onClick={() => onNavigate("activities")}
        >
          ← Back to Activities
        </button>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search apps..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-black focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Loading state */}
      {isLoading && appList.length === 0 && (
        <div className="text-base font-light text-center p-8">
          Loading apps...
        </div>
      )}

      {/* Empty state - no apps detected */}
      {!isLoading && appList.length === 0 && (
        <div className="text-center p-12 px-8 flex flex-col gap-4 border border-black">
          <p className="text-base font-normal">No apps detected yet</p>
          <p className="text-sm font-light text-gray-600">
            Start a focus session to see apps appear here for customization.
          </p>
          <button
            className="bg-transparent border border-black text-black px-8 py-3.5 text-base font-semibold cursor-pointer transition-all duration-200 min-w-[140px] hover:bg-black hover:text-white"
            onClick={() => onNavigate("timer")}
          >
            Start Timer
          </button>
        </div>
      )}

      {/* Empty state - no search results */}
      {!isLoading &&
        appList.length > 0 &&
        filteredApps.length === 0 && (
          <div className="text-center p-12 px-8 flex flex-col gap-4 border border-black">
            <p className="text-base font-normal">
              No apps match "{searchQuery}"
            </p>
            <button
              className="text-sm font-light border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors"
              onClick={() => setSearchQuery("")}
            >
              Clear Search
            </button>
          </div>
        )}

      {/* App list */}
      {!isLoading && filteredApps.length > 0 && (
        <div className="border border-black">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left p-4 text-xs font-light uppercase tracking-wide">
                  Logo
                </th>
                <th className="text-left p-4 text-xs font-light uppercase tracking-wide">
                  App Name
                </th>
                <th className="text-right p-4 text-xs font-light uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.bundleId} className="border-b border-black last:border-b-0">
                  <td className="p-4">
                    <AppLogo
                      bundleId={app.bundleId}
                      appName={app.appName}
                      size={32}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-normal">
                        {app.appName || app.bundleId}
                      </span>
                      {app.appName && (
                        <span className="text-xs font-light text-gray-600">
                          {app.bundleId}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setEditingBundleId(app.bundleId)}
                      className="px-4 py-2 border border-black bg-white text-black hover:bg-black hover:text-white transition-colors text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editingApp && editingBundleId && (
        <LogoSketchModal
          bundleId={editingBundleId}
          appName={editingApp.appName}
          initialLogoData={getInitialLogoData(editingBundleId)}
          initialColor={editingApp.config?.color}
          onSave={handleSave}
          onCancel={() => setEditingBundleId(null)}
        />
      )}
    </div>
  );
}

