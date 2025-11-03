/**
 * React Query hooks for app config management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, DetectedApp, LogoData } from "../types/app-config";

// Query keys
const QUERY_KEYS = {
  appConfig: (bundleId: string) => ["app-config", bundleId] as const,
  allAppConfigs: () => ["app-configs"] as const,
  detectedApps: () => ["detected-apps"] as const,
};

/**
 * Query hook for fetching a single app config by bundleId
 */
export function useAppConfig(bundleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.appConfig(bundleId),
    queryFn: async () => {
      const config = await invoke<AppConfig | null>("get_app_config", {
        bundleId,
      });
      return config;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Query hook for fetching all app configs
 */
export function useAllAppConfigs() {
  return useQuery({
    queryKey: QUERY_KEYS.allAppConfigs(),
    queryFn: async () => {
      const configs = await invoke<AppConfig[]>("get_all_app_configs");
      return configs;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Query hook for fetching all detected apps
 */
export function useDetectedApps() {
  return useQuery({
    queryKey: QUERY_KEYS.detectedApps(),
    queryFn: async () => {
      const apps = await invoke<DetectedApp[]>("get_all_detected_apps");
      return apps;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Mutation hook for upserting an app config
 */
export function useUpsertAppConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: {
      bundleId: string;
      appName?: string;
      logoData?: LogoData;
      color?: string;
    }) => {
      const now = new Date().toISOString();
      const appConfig: Omit<AppConfig, "id"> = {
        bundleId: config.bundleId,
        appName: config.appName,
        logoData: config.logoData ? JSON.stringify(config.logoData) : undefined,
        color: config.color,
        createdAt: now,
        updatedAt: now,
      };

      const result = await invoke<AppConfig>("upsert_app_config", {
        config: appConfig,
      });
      return result;
    },
    onSuccess: (data) => {
      // Invalidate individual config query
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.appConfig(data.bundleId),
      });
      // Invalidate all configs query
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.allAppConfigs(),
      });
    },
  });
}

/**
 * Mutation hook for deleting an app config
 */
export function useDeleteAppConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bundleId: string) => {
      await invoke("delete_app_config", { bundleId });
    },
    onSuccess: (_, bundleId) => {
      // Invalidate individual config query
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.appConfig(bundleId),
      });
      // Invalidate all configs query
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.allAppConfigs(),
      });
    },
  });
}
