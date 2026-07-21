import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import App from "@/app/App";
import { AppErrorBoundary } from "@/app/AppErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2
    }
  }
});

const analyticsEnabled = window.location.protocol === "https:"
  && window.location.hostname !== "localhost"
  && window.location.hostname !== "127.0.0.1";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
      {analyticsEnabled ? <Analytics /> : null}
    </QueryClientProvider>
  </React.StrictMode>
);
