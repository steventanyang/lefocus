import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

// Create a query client with Tauri-optimized defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Consider data fresh for 30 seconds
      staleTime: 30_000,
      // Keep unused data in cache for 5 minutes
      gcTime: 300_000,
      // Refetch on window focus (useful for desktop apps)
      refetchOnWindowFocus: true,
      // Only retry once for desktop app (not flaky network)
      retry: 1,
      // Don't refetch on mount if data is still fresh
      refetchOnMount: false,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools only in development */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
