import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/app/App";
import { AppErrorBoundary } from "@/app/AppErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
