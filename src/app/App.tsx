import { lazy, Suspense, useState } from "react";
import { Landmark, RefreshCw, Moon, Sun } from "lucide-react";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { MetricCard } from "@/components/ui/MetricCard";
import { useTreasuryYields } from "@/features/market/useTreasuryYields";
import { useTheme } from "@/hooks/useTheme";
import "@/styles/global.css";
import "@/styles/trader-workspace.css";
import { formatDate } from "@/utils/format";

type ResearchView = "market" | "weekly" | "compare" | "history" | "events" | "regimes";

const researchViewMeta: Record<Exclude<ResearchView, "market">, { title: string; description: string }> = {
  weekly: {
    title: "Weekly Curve Monitor",
    description: "Official Monday-Friday CMT records with an independently validated, clearly separated year-end statistical baseline."
  },
  compare: {
    title: "Historical Yield Curve Comparison",
    description: "Compare complete Treasury curves from up to three official business-day observations."
  },
  history: {
    title: "Historical Treasury Regime Analysis",
    description: "Analyze rates, spreads, and statistical behavior without leaving the workspace."
  },
  events: {
    title: "Macro Event Windows",
    description: "Sourced macro and methodology markers inside the selected range. Focus any event to open it in the rates charts."
  },
  regimes: {
    title: "Curve Movement Regimes",
    description: "Date-to-date two-tenor decomposition with ex-post classifications of completed calendar periods."
  }
};

const readInitialResearchView = (): ResearchView => {
  const view = new URLSearchParams(window.location.search).get("view")?.toLowerCase();
  if (view === "weekly" || view === "compare" || view === "history" || view === "events" || view === "regimes") return view;
  return "market";
};

const ResearchWorkbench = lazy(async () => {
  const module = await import("@/features/research/ResearchWorkbench");
  return { default: module.ResearchWorkbench };
});

function ResearchWorkbenchFallback() {
  return (
    <section className="workspace-shell workspace-shell--loading" aria-label="Treasury research workspace" aria-busy="true">
      <div className="workspace-tabs workspace-tabs--loading" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => <span key={index} className="workspace-tab" />)}
      </div>
      <div className="workspace-panel">
        <LoadingBlock className="panel" rows={6} />
      </div>
    </section>
  );
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const { data, error, isFetching, isLoading, refetch } = useTreasuryYields();
  const [researchView, setResearchView] = useState<ResearchView>(readInitialResearchView);
  const activeResearchMeta = researchView === "market" ? null : researchViewMeta[researchView];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="topbar__mark" aria-hidden="true">
            <Landmark size={19} strokeWidth={1.8} />
          </div>
          <div className="topbar__identity">
            <div className="topbar__deskline">
              <span>US Rates</span>
              <i aria-hidden="true" />
              <span>Treasury Research</span>
            </div>
            <h1>U.S. Treasury Curve Research</h1>
            <p className="topbar__subtitle">
              Official CMT rates, curve structure, and historical regimes.
            </p>
          </div>
        </div>
        <div className="topbar__actions">
          <div className={`refresh-pill ${isFetching ? "refresh-pill--active" : ""}`} aria-live="polite">
            <span className="refresh-pill__dot" />
            <span className="refresh-pill__copy">
              <small>Official CMT</small>
              <strong>{data ? formatDate(data.source.recordDate) : isLoading || isFetching ? "Connecting" : "Unavailable"}</strong>
            </span>
          </div>
          <button className="icon-button" type="button" onClick={() => refetch()} aria-label="Refresh data" title="Refresh official data">
            <RefreshCw size={18} className={isFetching ? "spin" : ""} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            aria-pressed={theme === "dark"}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {error ? (
        <section className="notice" role="alert">
          <strong>{data ? "Treasury refresh failed." : "Unable to load Treasury data."}</strong>
          <span>{data ? `Showing the last loaded official observation. ${error instanceof Error ? error.message : ""}` : error instanceof Error ? error.message : "Please retry in a moment."}</span>
        </section>
      ) : null}

      {data?.cache.warning ? (
        <section className="notice notice--warning" role="status">
          <strong>Stale cache in use.</strong>
          <span>{data.cache.warning}</span>
        </section>
      ) : null}

      <section className="metric-grid" aria-label="Latest official Treasury CMT yields">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => <LoadingBlock key={index} className="metric-card" rows={3} />)
          : data
            ? data.summary.map((point) => <MetricCard key={point.key} point={point} previousRecordDate={data.source.previousRecordDate} />)
            : <div className="metric-grid__empty">Official CMT snapshot unavailable</div>}
      </section>

      {activeResearchMeta ? (
        <section className="research-header research-header--workspace workspace-intro" aria-live="polite">
          <div>
            <p className="eyebrow">Macro research layer</p>
            <h2>{activeResearchMeta.title}</h2>
            <p>{activeResearchMeta.description}</p>
          </div>
        </section>
      ) : null}

      <Suspense fallback={<ResearchWorkbenchFallback />}>
        <ResearchWorkbench
          currentData={data}
          currentLoading={isLoading || isFetching}
          currentError={error}
          onActiveViewChange={(view) => setResearchView(view === "comparison" ? "compare" : view === "snapshot" || view === "futures" ? "market" : view)}
        />
      </Suspense>

      <footer className="app-footer">
        <span>Official daily: U.S. Treasury XML. History: Federal Reserve H.15. Futures reference: delayed Yahoo Finance/CBOT.</span>
        <span>CMT and futures datasets remain separate; no proxy price enters official curve analytics.</span>
      </footer>
    </main>
  );
}

export default App;
