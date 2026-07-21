import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  CalendarRange,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  Download,
  ExternalLink,
  Flag,
  Gauge,
  Focus,
  GitCompareArrows,
  History,
  Info,
  Layers3,
  Link2,
  RotateCcw
} from "lucide-react";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { CurveRegimeTimeline } from "@/features/regimes/CurveRegimeTimeline";
import { TreasuryFuturesWorkspace } from "@/features/futures/TreasuryFuturesWorkspace";
import { CurveMatrix } from "@/features/market/CurveMatrix";
import { YieldCurveChart } from "@/features/market/YieldCurveChart";
import { WeeklyCurveOutlook } from "@/features/weekly/WeeklyCurveOutlook";
import { YieldCurveComparison } from "./YieldCurveComparison";
import { useHistoricalYields } from "./useHistoricalYields";
import { formatBps, formatDate, formatShortDate, formatTimestamp, formatYield } from "@/utils/format";
import {
  buildStats,
  buildTreasuryCurveCsv,
  curvePairs,
  eventsInRange,
  filterRowsByRange,
  getComparisonTargetDate,
  getEventMarkerDate,
  getEventFocusRange,
  getPresetRange,
  maturityKeys,
  rangePresetLabels,
  spreadKeys,
  type CurveMoveHorizon,
  type MacroEvent,
  type RangePreset
} from "@/domain/treasury/research";
import type { ResearchMaturityKey, SpreadKey, TreasuryPayload } from "@/domain/treasury/types";
import { sampleTimeSeriesByExtrema } from "@/domain/treasury/chartSampling";

type WorkspaceTab = "snapshot" | "weekly" | "futures" | "comparison" | "history" | "events" | "regimes";
type HistoryView = "charts" | "statistics";

// The delayed-futures workspace is temporarily hidden from the UI. All futures
// code paths stay intact; flip this to true to restore the tab.
const SHOW_FUTURES_TAB = false;

const rangePresets: Array<Exclude<RangePreset, "CUSTOM">> = ["1Y", "5Y", "10Y", "20Y", "MAX"];

const workspaceTabs: Array<{ id: WorkspaceTab; label: string; description: string; icon: typeof ChartNoAxesCombined }> = [
  { id: "snapshot", label: "Market", description: "Official CMT", icon: ChartNoAxesCombined },
  { id: "weekly", label: "Weekly", description: "Actuals + year-end", icon: CalendarDays },
  { id: "futures", label: "Futures", description: "Intraday proxy", icon: Gauge },
  { id: "comparison", label: "Compare", description: "Date to date", icon: GitCompareArrows },
  { id: "history", label: "History", description: "Rates and spreads", icon: History },
  { id: "events", label: "Events", description: "Macro windows", icon: Flag },
  { id: "regimes", label: "Regimes", description: "Curve movement", icon: Layers3 }
];

const visibleWorkspaceTabs = workspaceTabs.filter((tab) => tab.id !== "futures" || SHOW_FUTURES_TAB);

const historyViews: Array<{ id: HistoryView; label: string }> = [
  { id: "charts", label: "Rates & Curves" },
  { id: "statistics", label: "Statistics" }
];

interface InitialWorkspaceState {
  activeTab: WorkspaceTab;
  historyView: HistoryView;
  preset: RangePreset;
  range: { start: string; end: string };
  selectedSpread: SpreadKey;
  selectedPairKey: SpreadKey;
  regimeHorizon: CurveMoveHorizon;
  comparisonAsOf: string;
  comparisonReference: string;
  comparisonReference2: string;
}

const workspaceStateQueryKeys = ["view", "range", "from", "to", "section", "spread", "pair", "interval", "asof", "ref", "ref2"];

const workspaceTabFromQuery: Record<string, WorkspaceTab> = {
  market: "snapshot",
  snapshot: "snapshot",
  weekly: "weekly",
  outlook: "weekly",
  futures: "futures",
  intraday: "futures",
  compare: "comparison",
  comparison: "comparison",
  history: "history",
  events: "events",
  regimes: "regimes"
};

const workspaceTabToQuery: Record<WorkspaceTab, string> = {
  snapshot: "market",
  weekly: "weekly",
  futures: "futures",
  comparison: "compare",
  history: "history",
  events: "events",
  regimes: "regimes"
};

const isIsoDate = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const readAllowedValue = <T extends string>(value: string | null, options: readonly T[], fallback: T): T =>
  value && options.includes(value as T) ? value as T : fallback;

const readWorkspaceState = (): InitialWorkspaceState => {
  if (typeof window === "undefined") {
    return {
      activeTab: "snapshot",
      historyView: "charts",
      preset: "10Y",
      range: { start: "", end: "" },
      selectedSpread: "10Y2Y",
      selectedPairKey: "10Y2Y",
      regimeHorizon: "1M",
      comparisonAsOf: "",
      comparisonReference: "",
      comparisonReference2: ""
    };
  }

  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const to = params.get("to");
  const rawPreset = params.get("range")?.toUpperCase() ?? null;
  const customRangeIsValid = rawPreset === "CUSTOM" && isIsoDate(from) && isIsoDate(to) && from <= to;
  const preset = customRangeIsValid
    ? "CUSTOM"
    : readAllowedValue<Exclude<RangePreset, "CUSTOM">>(rawPreset, rangePresets, "10Y");
  const pairKeys = curvePairs.map((pair) => pair.key);
  const interval = params.get("interval")?.toLowerCase();
  const section = params.get("section")?.toLowerCase() ?? null;
  const requestedTab = workspaceTabFromQuery[params.get("view")?.toLowerCase() ?? ""] ?? "snapshot";
  const activeTab = !SHOW_FUTURES_TAB && requestedTab === "futures"
    ? "snapshot"
    // Older links exposed events as a History section; map them to the Events tab.
    : requestedTab === "history" && section === "events" ? "events" : requestedTab;

  return {
    activeTab,
    historyView: readAllowedValue(section, historyViews.map((view) => view.id), "charts"),
    preset,
    range: customRangeIsValid ? { start: from, end: to } : { start: "", end: "" },
    selectedSpread: readAllowedValue(params.get("spread")?.toUpperCase() ?? null, spreadKeys, "10Y2Y"),
    selectedPairKey: readAllowedValue(params.get("pair")?.toUpperCase() ?? null, pairKeys, "10Y2Y"),
    regimeHorizon: interval === "weekly" || interval === "1w" ? "1W" : "1M",
    comparisonAsOf: isIsoDate(params.get("asof")) ? params.get("asof") as string : "",
    comparisonReference: isIsoDate(params.get("ref")) ? params.get("ref") as string : "",
    comparisonReference2: isIsoDate(params.get("ref2")) ? params.get("ref2") as string : ""
  };
};

const getAdjacentTab = <T extends string>(items: T[], current: T, key: string) => {
  const currentIndex = items.indexOf(current);
  if (currentIndex < 0) return null;

  if (key === "Home") return items[0];
  if (key === "End") return items.at(-1) ?? null;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;

  const offset = key === "ArrowRight" ? 1 : -1;
  return items[(currentIndex + offset + items.length) % items.length];
};

const yieldColors: Record<ResearchMaturityKey, string> = {
  "2Y": "var(--series-2y)",
  "5Y": "var(--series-5y)",
  "10Y": "var(--series-10y)",
  "30Y": "var(--series-30y)"
};

const spreadColors: Record<SpreadKey, string> = {
  "5Y2Y": "var(--series-5y)",
  "10Y2Y": "var(--series-2y)",
  "30Y2Y": "var(--series-30y)",
  "10Y5Y": "var(--series-10y)",
  "30Y5Y": "var(--series-30y)",
  "30Y10Y": "var(--series-30y)"
};

interface MultiTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    value?: number | null;
    color?: string;
  }>;
  unit: "yield" | "bps";
}

function MultiTooltip({ active, label, payload, unit }: MultiTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip chart-tooltip--wide">
      <span className="chart-tooltip__label">{formatShortDate(label)}</span>
      <div className="chart-tooltip__rows">
        {payload
          .filter((item) => typeof item.value === "number")
          .map((item) => (
            <div className="chart-tooltip__row" key={item.dataKey}>
              <span>
                <i style={{ backgroundColor: item.color }} />
                {item.name ?? item.dataKey}
              </span>
              <strong>{unit === "yield" ? formatYield(item.value) : formatBps(item.value)}</strong>
            </div>
          ))}
      </div>
    </div>
  );
}

const compactDateTick = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC"
  }).format(value);
};

const formatStat = (value: number | null | undefined, mode: "yield" | "bps" | "signedBps" | "pct" = "yield") => {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  if (mode === "bps") return `${value.toFixed(1)} bps`;
  if (mode === "signedBps") return formatBps(value);
  if (mode === "pct") return `${value.toFixed(2)}%`;
  return formatYield(value);
};

const eventClass = (event: MacroEvent) => `event-card event-card--${event.category.toLowerCase()}`;

interface ResearchWorkbenchProps {
  currentData?: TreasuryPayload;
  currentLoading: boolean;
  currentError: Error | null;
  onActiveViewChange?: (view: WorkspaceTab) => void;
}

export function ResearchWorkbench({ currentData, currentLoading, currentError, onActiveViewChange }: ResearchWorkbenchProps) {
  const [initialWorkspaceState] = useState(readWorkspaceState);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialWorkspaceState.activeTab);
  const [historyView, setHistoryView] = useState<HistoryView>(initialWorkspaceState.historyView);
  const shouldLoadHistory = activeTab === "weekly" || activeTab === "comparison" || activeTab === "history" || activeTab === "events" || activeTab === "regimes";
  const { data, error, isLoading } = useHistoricalYields(shouldLoadHistory);
  const historicalRows = data?.rows;
  const [preset, setPreset] = useState<RangePreset>(initialWorkspaceState.preset);
  const [range, setRange] = useState(initialWorkspaceState.range);
  const [selectedSpread, setSelectedSpread] = useState<SpreadKey>(initialWorkspaceState.selectedSpread);
  const [selectedPairKey, setSelectedPairKey] = useState<SpreadKey>(initialWorkspaceState.selectedPairKey);
  const [regimeHorizon, setRegimeHorizon] = useState<CurveMoveHorizon>(initialWorkspaceState.regimeHorizon);
  const [comparisonAsOf, setComparisonAsOf] = useState(initialWorkspaceState.comparisonAsOf);
  const [comparisonReference, setComparisonReference] = useState(initialWorkspaceState.comparisonReference);
  const [comparisonReference2, setComparisonReference2] = useState(initialWorkspaceState.comparisonReference2);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [showEventMarkers, setShowEventMarkers] = useState(true);
  const [pinnedEventId, setPinnedEventId] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const highlightedEventId = hoveredEventId ?? pinnedEventId;

  useEffect(() => {
    onActiveViewChange?.(activeTab);
  }, [activeTab, onActiveViewChange]);

  useEffect(() => {
    if (!historicalRows?.length) return;
    const firstDate = historicalRows[0]?.date ?? "";
    const latestDate = historicalRows.at(-1)?.date ?? "";
    const normalizedAsOf = comparisonAsOf >= firstDate && comparisonAsOf <= latestDate ? comparisonAsOf : latestDate;
    const defaultReference = normalizedAsOf ? getComparisonTargetDate(normalizedAsOf, "1Y") : firstDate;
    const normalizedReference = comparisonReference >= firstDate && comparisonReference < normalizedAsOf
      ? comparisonReference
      : defaultReference < firstDate ? firstDate : defaultReference;
    const normalizedReference2 = comparisonReference2 && comparisonReference2 >= firstDate && comparisonReference2 < normalizedAsOf
      ? comparisonReference2
      : "";

    if (preset === "CUSTOM" && range.start && range.end) {
      const normalizedStart = range.start < firstDate ? firstDate : range.start;
      const normalizedEnd = range.end > latestDate ? latestDate : range.end;
      if (normalizedStart > normalizedEnd) {
        setPreset("10Y");
        setRange(getPresetRange("10Y", historicalRows));
      } else if (normalizedStart !== range.start || normalizedEnd !== range.end) {
        setRange({ start: normalizedStart, end: normalizedEnd });
      }
    } else if (!range.start || !range.end) {
      const initialPreset = preset === "CUSTOM" ? "10Y" : preset;
      setRange(getPresetRange(initialPreset, historicalRows));
      if (preset === "CUSTOM") setPreset("10Y");
    }
    if (comparisonAsOf !== normalizedAsOf) setComparisonAsOf(normalizedAsOf);
    if (comparisonReference !== normalizedReference) setComparisonReference(normalizedReference);
    if (comparisonReference2 !== normalizedReference2) setComparisonReference2(normalizedReference2);
  }, [comparisonAsOf, comparisonReference, comparisonReference2, historicalRows, preset, range.end, range.start]);

  useEffect(() => {
    const url = new URL(window.location.href);
    workspaceStateQueryKeys.forEach((key) => url.searchParams.delete(key));

    if (activeTab !== "snapshot") url.searchParams.set("view", workspaceTabToQuery[activeTab]);

    if (activeTab === "comparison" || activeTab === "history" || activeTab === "events" || activeTab === "regimes") {
      if (preset === "CUSTOM" && range.start && range.end) {
        url.searchParams.set("range", "custom");
        url.searchParams.set("from", range.start);
        url.searchParams.set("to", range.end);
      } else if (preset !== "10Y" && preset !== "CUSTOM") {
        url.searchParams.set("range", preset);
      }
    }

    if (activeTab === "history") {
      if (historyView !== "charts") url.searchParams.set("section", historyView);
      if (selectedSpread !== "10Y2Y") url.searchParams.set("spread", selectedSpread);
    }

    if (activeTab === "regimes" || activeTab === "weekly") {
      if (selectedPairKey !== "10Y2Y") url.searchParams.set("pair", selectedPairKey);
      if (activeTab === "regimes" && regimeHorizon === "1W") url.searchParams.set("interval", "weekly");
    }

    if (activeTab === "comparison") {
      if (comparisonAsOf) url.searchParams.set("asof", comparisonAsOf);
      if (comparisonReference) url.searchParams.set("ref", comparisonReference);
      if (comparisonReference2) url.searchParams.set("ref2", comparisonReference2);
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
    const activeLabel = workspaceTabs.find((tab) => tab.id === activeTab)?.label;
    document.title = activeTab === "snapshot"
      ? "U.S. Treasury Curve Research"
      : `${activeLabel} · U.S. Treasury Curve Research`;
  }, [activeTab, comparisonAsOf, comparisonReference, comparisonReference2, historyView, preset, range.end, range.start, regimeHorizon, selectedPairKey, selectedSpread]);

  useEffect(() => {
    if (copyStatus === "idle") return undefined;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const selectedRows = useMemo(() => {
    if (!historicalRows?.length || !range.start || !range.end) return [];
    return filterRowsByRange(historicalRows, range.start, range.end);
  }, [historicalRows, range.end, range.start]);

  const visibleEvents = useMemo(() => {
    if (!range.start || !range.end) return [];
    return eventsInRange(range.start, range.end);
  }, [range.end, range.start]);

  const chartEventMarkers = useMemo(
    () => visibleEvents.flatMap((event) => {
      const markerDate = getEventMarkerDate(event, selectedRows, range.start, range.end);
      return markerDate ? [{ event, markerDate }] : [];
    }),
    [range.end, range.start, selectedRows, visibleEvents]
  );

  const statsReferenceRows = useMemo(() => {
    if (!historicalRows?.length || !range.end) return selectedRows;
    return historicalRows.filter((row) => row.date <= range.end);
  }, [historicalRows, range.end, selectedRows]);
  const stats = useMemo(() => buildStats(selectedRows, statsReferenceRows), [selectedRows, statsReferenceRows]);
  const yieldChartRows = useMemo(
    () => sampleTimeSeriesByExtrema(selectedRows, maturityKeys, 420),
    [selectedRows]
  );
  const spreadChartRows = useMemo(
    () => sampleTimeSeriesByExtrema(selectedRows, [selectedSpread], 420),
    [selectedRows, selectedSpread]
  );

  const selectedSpreadMeta = data?.spreads.find((spread) => spread.key === selectedSpread);
  const selectedPair = curvePairs.find((pair) => pair.key === selectedPairKey) ?? curvePairs[1];

  const setPresetRange = (nextPreset: Exclude<RangePreset, "CUSTOM">) => {
    if (!data?.rows.length) return;
    setPreset(nextPreset);
    setRange(getPresetRange(nextPreset, data.rows));
  };

  const onCustomDateChange = (field: "start" | "end", value: string) => {
    setPreset("CUSTOM");
    setRange((current) => ({ ...current, [field]: value }));
  };

  const focusEvent = (event: MacroEvent) => {
    if (!data?.rows.length) return;
    setPreset("CUSTOM");
    setRange(getEventFocusRange(event, data.rows));
    setActiveTab("history");
    setHistoryView("charts");
  };

  const setComparisonHorizon = (horizon: "1W" | "1M" | "1Y" | "RANGE") => {
    if (!data?.rows.length) return;
    const asOf = comparisonAsOf || data.rows.at(-1)?.date;
    if (!asOf) return;
    setComparisonAsOf(asOf);
    if (horizon === "RANGE") {
      setComparisonReference(range.start || getComparisonTargetDate(asOf, "1Y"));
      return;
    }
    const target = getComparisonTargetDate(asOf, horizon);
    const firstDate = data.rows[0]?.date ?? target;
    setComparisonReference(target < firstDate ? firstDate : target);
  };

  const setComparisonAsOfDate = (value: string) => {
    setComparisonAsOf(value);
    setComparisonReference((current) => {
      if (current && current < value) return current;
      const target = getComparisonTargetDate(value, "1Y");
      const firstDate = data?.rows[0]?.date ?? target;
      return target < firstDate ? firstDate : target;
    });
  };

  const handleWorkspaceTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: WorkspaceTab) => {
    const next = getAdjacentTab(visibleWorkspaceTabs.map((tab) => tab.id), current, event.key);
    if (!next) return;

    event.preventDefault();
    setActiveTab(next);
    requestAnimationFrame(() => document.getElementById(`workspace-tab-${next}`)?.focus());
  };

  const handleHistoryViewKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: HistoryView) => {
    const next = getAdjacentTab(historyViews.map((view) => view.id), current, event.key);
    if (!next) return;

    event.preventDefault();
    setHistoryView(next);
    requestAnimationFrame(() => document.getElementById(`history-view-tab-${next}`)?.focus());
  };

  const downloadSelectedCurveData = () => {
    if (!selectedRows.length) return;
    const csv = buildTreasuryCurveCsv(selectedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `treasury-curve-${range.start || "start"}-${range.end || "end"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyCurrentView = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = window.location.href;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy command was rejected");
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  const renderResearchControls = () => (
    <div className="research-controls">
      <div className="segmented-control" aria-label="Date range presets">
        {rangePresets.map((item) => (
          <button
            className={preset === item ? "segmented-control__button segmented-control__button--active" : "segmented-control__button"}
            type="button"
            key={item}
            aria-pressed={preset === item}
            onClick={() => setPresetRange(item)}
          >
            {rangePresetLabels[item]}
          </button>
        ))}
      </div>
      <div className="date-controls">
        <CalendarRange size={16} aria-hidden="true" />
        <label>
          <span>From</span>
          <input type="date" value={range.start} min={data?.source.recordStartDate ?? undefined} max={range.end || data?.source.recordEndDate || undefined} onChange={(event) => onCustomDateChange("start", event.target.value)} onInput={(event) => onCustomDateChange("start", event.currentTarget.value)} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={range.end} min={range.start || data?.source.recordStartDate || undefined} max={data?.source.recordEndDate ?? undefined} onChange={(event) => onCustomDateChange("end", event.target.value)} onInput={(event) => onCustomDateChange("end", event.currentTarget.value)} />
        </label>
        <button className="text-button" type="button" onClick={() => setPresetRange("10Y")}>
          <RotateCcw size={15} aria-hidden="true" />
          Reset
        </button>
        <button className="text-button" type="button" disabled={!selectedRows.length} onClick={downloadSelectedCurveData}>
          <Download size={15} aria-hidden="true" />
          CSV
        </button>
      </div>
    </div>
  );

  const renderEventReferenceLines = () =>
    showEventMarkers
      ? chartEventMarkers.map(({ event, markerDate }) => {
          const isHighlighted = highlightedEventId === event.id;
          return (
            <ReferenceLine
              key={event.id}
              x={markerDate}
              stroke={isHighlighted ? "var(--chart-highlight)" : "var(--event-line)"}
              strokeWidth={isHighlighted ? 2 : 1}
              strokeDasharray="4 6"
              label={isHighlighted ? { value: event.title, position: "insideTopLeft", fill: "var(--ink)", fontSize: 11 } : undefined}
            />
          );
        })
      : [];

  const renderEventMarkerControls = () => (
    <div className="chart-events-bar">
      <button
        className="chart-events-toggle"
        type="button"
        aria-pressed={showEventMarkers}
        onClick={() => setShowEventMarkers((current) => !current)}
        title="Show or hide sourced event markers on the charts"
      >
        <Flag size={14} aria-hidden="true" />
        Event markers {showEventMarkers ? "on" : "off"}
      </button>
      {showEventMarkers ? (
        chartEventMarkers.length ? (
          <div className="chart-event-chips" aria-label="Events in the selected window; hover or select to highlight on the charts">
            {chartEventMarkers.map(({ event }) => {
              const isActive = highlightedEventId === event.id;
              return (
                <button
                  key={event.id}
                  type="button"
                  className={`chart-event-chip${isActive ? " chart-event-chip--active" : ""}`}
                  aria-pressed={pinnedEventId === event.id}
                  title={`${event.title} · ${formatDate(event.startDate)}${event.endDate ? ` - ${formatDate(event.endDate)}` : ""} · click to pin the marker`}
                  onMouseEnter={() => setHoveredEventId(event.id)}
                  onMouseLeave={() => setHoveredEventId(null)}
                  onFocus={() => setHoveredEventId(event.id)}
                  onBlur={() => setHoveredEventId(null)}
                  onClick={() => setPinnedEventId((current) => (current === event.id ? null : event.id))}
                >
                  <small>{formatShortDate(event.startDate)}</small>
                  {event.title}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="chart-events-bar__empty">No configured event markers fall inside the selected range.</span>
        )
      ) : null}
    </div>
  );

  const renderHistoryCharts = () => {
    if (!selectedRows.length) return <div className="empty-state">No valid Treasury observations are available inside the selected date window.</div>;

    return (
      <>
      {renderEventMarkerControls()}
      <div className="research-grid">
        <article className="panel research-chart-panel research-chart-panel--wide">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Yields</p>
              <h3>Nominal Constant Maturity Yields</h3>
            </div>
            <span className="panel__meta">{selectedRows.length.toLocaleString()} selected observations</span>
          </div>
          <div className="research-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yieldChartRows} margin={{ top: 12, right: 18, bottom: 6, left: -6 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
                <XAxis dataKey="date" minTickGap={42} tickFormatter={compactDateTick} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={50} domain={["dataMin - 0.35", "dataMax + 0.35"]} tickFormatter={(value) => `${Number(value).toFixed(1)}%`} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <Tooltip content={<MultiTooltip unit="yield" />} cursor={{ stroke: "var(--chart-crosshair)", strokeWidth: 1, strokeDasharray: "3 4" }} />
                <Legend verticalAlign="top" align="right" iconType="plainline" wrapperStyle={{ color: "var(--muted)" }} />
                {renderEventReferenceLines()}
                {maturityKeys.map((key) => <Line key={key} type="linear" dataKey={key} name={key} connectNulls={false} dot={false} stroke={yieldColors[key]} strokeWidth={key === "10Y" ? 2.4 : 1.8} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel research-chart-panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Curve measures</p>
              <h3>{selectedSpreadMeta?.longLabel ?? selectedSpread}</h3>
            </div>
          </div>
          <div className="spread-selector" aria-label="Spread selector">
            {spreadKeys.map((key) => {
              const spread = data?.spreads.find((item) => item.key === key);
              return (
                <button className={selectedSpread === key ? "spread-selector__button spread-selector__button--active" : "spread-selector__button"} type="button" key={key} aria-pressed={selectedSpread === key} onClick={() => setSelectedSpread(key)}>
                  {spread?.label ?? key}
                </button>
              );
            })}
          </div>
          <div className="spread-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spreadChartRows} margin={{ top: 10, right: 14, bottom: 4, left: -10 }}>
                <defs>
                  <linearGradient id="spread-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={spreadColors[selectedSpread]} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={spreadColors[selectedSpread]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
                <XAxis dataKey="date" minTickGap={32} tickFormatter={compactDateTick} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={66} tickFormatter={(value) => `${Number(value).toFixed(0)} bps`} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip content={<MultiTooltip unit="bps" />} cursor={{ stroke: "var(--chart-crosshair)", strokeWidth: 1, strokeDasharray: "3 4" }} />
                <ReferenceLine y={0} stroke="var(--zero-line)" strokeDasharray="4 5" />
                {renderEventReferenceLines()}
                <Area type="linear" dataKey={selectedSpread} name={selectedSpreadMeta?.label ?? selectedSpread} stroke={spreadColors[selectedSpread]} strokeWidth={2} fill="url(#spread-gradient)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="spread-note">
            <Info size={15} aria-hidden="true" />
            <span>Spreads are shown in basis points. Values below zero indicate inversion. Observed business days only; weekends and market holidays are omitted.</span>
          </div>
        </article>
      </div>
      </>
    );
  };

  const renderEvents = () => (
    <div className="event-section">
      <div className="section-header section-header--compact">
        <div>
          <p className="eyebrow">Event windows</p>
          <h2>Macro and Methodology Markers</h2>
        </div>
        <span>{visibleEvents.length} events in selected window</span>
      </div>
      <div className="event-rail">
        {visibleEvents.length ? visibleEvents.map((event) => (
          <article className={eventClass(event)} key={event.id}>
            <span>{event.category}</span>
            <strong>{event.title}</strong>
            <small>{formatDate(event.startDate)}{event.endDate ? ` - ${formatDate(event.endDate)}` : ""}</small>
            <em>{event.description}</em>
            <small className="event-card__basis">{event.windowBasis}</small>
            <div className="event-card__actions">
              <button type="button" onClick={() => focusEvent(event)}><Focus size={14} aria-hidden="true" />Focus charts</button>
              <a href={event.sourceUrl} target="_blank" rel="noreferrer">{event.sourceName}<ExternalLink size={12} aria-hidden="true" /></a>
            </div>
          </article>
        )) : <div className="empty-state">No configured event markers fall inside the selected range.</div>}
      </div>
      <p className="event-section__note"><Info size={14} aria-hidden="true" />Events are sourced contextual annotations, not causal attributions. A non-observation event date is drawn at the next available official CMT observation.</p>
    </div>
  );

  const renderStatistics = () => (
    <article className="panel stats-panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Selected-period analytics</p>
          <h3>Yield Distribution and Changes</h3>
        </div>
        <span className="panel__meta">Window end {range.end ? formatDate(range.end) : "n/a"} · Retrieved {formatTimestamp(data?.source.retrievedAt)}</span>
      </div>
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead><tr><th>Maturity</th><th>Last obs.</th><th>Last date</th><th>Min</th><th>Max</th><th>Average</th><th>Ann. vol</th><th>1M Δ</th><th>3M Δ</th><th>1Y Δ</th><th><abbr title="Empirical cumulative distribution function">Last-value ECDF</abbr></th><th>Obs.</th></tr></thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.key}>
                <th>{row.key}</th><td>{formatStat(row.latest)}</td><td>{formatDate(row.latestObservationDate)}</td><td>{formatStat(row.min)}</td><td>{formatStat(row.max)}</td><td>{formatStat(row.average)}</td><td>{formatStat(row.annualizedVolBps, "bps")}</td><td>{formatStat(row.oneMonthChangeBps, "signedBps")}</td><td>{formatStat(row.threeMonthChangeBps, "signedBps")}</td><td>{formatStat(row.oneYearChangeBps, "signedBps")}</td><td>{formatStat(row.percentile, "pct")}</td><td>{row.observations.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="source-footnote">
        <span>{data?.source.name}</span>
        <span>{data?.source.supplementalSource}</span>
        <span>{data?.source.note}</span>
        <span>Observed business days only. Weekends, market holidays, and source-level ND values are not imputed. When an event falls on a non-observation date, its chart line is placed at the next available official CMT observation and the event card retains the actual calendar date.</span>
        <span>Last obs. is the latest valid maturity value inside the selected window. Last-value ECDF is the share of valid selected observations at or below that value; Obs. is the valid sample count.</span>
        <span>Min, max, average, volatility, and ECDF use the selected range. 1M, 3M, and 1Y changes use the nearest valid observation on or before each calendar lookback, including an observation just before the visible range; a value is shown only when that observation is within 10 calendar days of the target date.</span>
        <span>Annualized volatility is the sample standard deviation of business-day yield changes multiplied by the square root of 252.</span>
        <span>When a chart window exceeds 420 observations, its display path uses extrema-preserving sampling for rendering performance. Statistics, lookback changes, regime calculations, and CSV exports continue to use every source observation.</span>
      </div>
    </article>
  );

  const renderResearchHeader = () => (
    <div className="research-header research-header--workspace research-header--source-only">
      <div className="research-source" aria-live="polite">
        <span>
          {data
            ? data.rows.length > 0 && data.source.recordStartDate && data.source.recordEndDate
              ? `History: ${formatDate(data.source.recordStartDate)} - ${formatDate(data.source.recordEndDate)}`
              : "History: no official observations"
            : error
              ? "History: official H.15 unavailable"
              : "History: loading official H.15 records"}
        </span>
        <strong>{data ? `${data.rows.length.toLocaleString()} daily records` : error ? "No records loaded" : "Preparing daily records"}</strong>
        <button
          type="button"
          className={`workspace-copy-link${copyStatus === "copied" ? " workspace-copy-link--copied" : ""}${copyStatus === "error" ? " workspace-copy-link--error" : ""}`}
          onClick={copyCurrentView}
          aria-live="polite"
          title="Copy a link to this workspace setup"
        >
          {copyStatus === "copied" ? <Check size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
          <span>{copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy view"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <section className="workspace-shell" aria-label="Treasury research workspace">
      <div className="workspace-tabs" role="tablist" aria-label="Treasury dashboard views" aria-orientation="horizontal">
        {visibleWorkspaceTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`workspace-tab-${tab.id}`}
              className={activeTab === tab.id ? "workspace-tab workspace-tab--active" : "workspace-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`workspace-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleWorkspaceTabKeyDown(event, tab.id)}
              aria-label={`${tab.label}: ${tab.description}`}
            >
              <Icon size={17} aria-hidden="true" />
              <strong>{tab.label}</strong>
            </button>
          );
        })}
      </div>
      {visibleWorkspaceTabs
        .filter((tab) => tab.id !== activeTab)
        .map((tab) => <div key={tab.id} id={`workspace-panel-${tab.id}`} role="tabpanel" aria-labelledby={`workspace-tab-${tab.id}`} hidden />)}

      {activeTab === "snapshot" ? (
        <div id="workspace-panel-snapshot" role="tabpanel" aria-labelledby="workspace-tab-snapshot" tabIndex={0} className="workspace-panel workspace-panel--snapshot">
          <div className="dashboard-grid dashboard-grid--workspace">
            {currentData ? <YieldCurveChart data={currentData.curve} recordDate={currentData.source.recordDate} /> : currentLoading ? <LoadingBlock className="panel panel--curve" rows={6} /> : <div className="empty-state">Official CMT market snapshot unavailable{currentError?.message ? `: ${currentError.message}` : "."}</div>}
            {currentData ? <CurveMatrix data={currentData} /> : currentLoading ? <LoadingBlock className="panel panel--curve-matrix" rows={6} /> : null}
          </div>
          {currentData ? <div className="workspace-source-strip">
            <span>Latest values are official Treasury CMT par yields, derived from indicative bid-side quotations observed near 3:30 PM ET on trading days.</span>
            <span>{currentLoading ? "Checking Treasury XML" : `Official CMT ${formatDate(currentData.source.recordDate)}`}</span>
          </div> : null}
        </div>
      ) : activeTab === "futures" ? (
        <TreasuryFuturesWorkspace />
      ) : isLoading || !data ? (
        <div className="workspace-panel" role="tabpanel" id={`workspace-panel-${activeTab}`} aria-labelledby={`workspace-tab-${activeTab}`} tabIndex={0}>
          {renderResearchHeader()}
          {error ? <div className="notice" role="alert"><strong>Unable to load long-run historical data.</strong><span>{error instanceof Error ? error.message : "Please retry in a moment."}</span></div> : <LoadingBlock className="panel" rows={7} />}
        </div>
      ) : (
        <div className="workspace-panel" role="tabpanel" id={`workspace-panel-${activeTab}`} aria-labelledby={`workspace-tab-${activeTab}`} tabIndex={0}>
          {data.cache.warning || error ? <div className="notice notice--warning" role="status"><strong>Historical refresh warning.</strong><span>{data.cache.warning ?? `Displaying the last loaded H.15 dataset. ${error instanceof Error ? error.message : ""}`}</span></div> : null}
          {renderResearchHeader()}

          {activeTab === "comparison" ? (
            <>
              <div className="comparison-shortcuts" aria-label="Comparison date shortcuts">
                <span>Reference window</span>
                {(["1W", "1M", "1Y", "RANGE"] as const).map((item) => <button key={item} type="button" onClick={() => setComparisonHorizon(item)}>{item === "RANGE" ? "Range start" : item}</button>)}
              </div>
              <YieldCurveComparison rows={data.rows} asOfDate={comparisonAsOf} referenceDate={comparisonReference} secondReferenceDate={comparisonReference2} onAsOfDateChange={setComparisonAsOfDate} onReferenceDateChange={setComparisonReference} onSecondReferenceDateChange={setComparisonReference2} />
            </>
          ) : null}

          {activeTab === "weekly" ? <WeeklyCurveOutlook rows={data.rows} pair={selectedPair} onPairChange={setSelectedPairKey} /> : null}

          {activeTab === "history" || activeTab === "events" || activeTab === "regimes" ? renderResearchControls() : null}

          {activeTab === "events" ? renderEvents() : null}

          {activeTab === "history" ? (
            <>
              <div className="research-subtabs" role="tablist" aria-label="Historical research panels" aria-orientation="horizontal">
                {historyViews.map((view) => (
                  <button
                    id={`history-view-tab-${view.id}`}
                    key={view.id}
                    className={historyView === view.id ? "research-subtab research-subtab--active" : "research-subtab"}
                    type="button"
                    role="tab"
                    aria-selected={historyView === view.id}
                    aria-controls={`history-view-panel-${view.id}`}
                    tabIndex={historyView === view.id ? 0 : -1}
                    onClick={() => setHistoryView(view.id)}
                    onKeyDown={(event) => handleHistoryViewKeyDown(event, view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              {historyViews
                .filter((view) => view.id !== historyView)
                .map((view) => <div key={view.id} id={`history-view-panel-${view.id}`} role="tabpanel" aria-labelledby={`history-view-tab-${view.id}`} hidden />)}
              <div id={`history-view-panel-${historyView}`} role="tabpanel" aria-labelledby={`history-view-tab-${historyView}`} tabIndex={0}>
                {historyView === "charts" ? renderHistoryCharts() : renderStatistics()}
              </div>
            </>
          ) : null}

          {activeTab === "regimes" ? (
            <>
              <div className="regime-controls">
                <div className="regime-control-group">
                  <span className="regime-control-group__label">Curve segment</span>
                  <div className="spread-selector" aria-label="Curve segment selector">
                    {curvePairs.map((pair) => <button className={selectedPairKey === pair.key ? "spread-selector__button spread-selector__button--active" : "spread-selector__button"} type="button" key={pair.key} aria-pressed={selectedPairKey === pair.key} onClick={() => setSelectedPairKey(pair.key)}>{pair.label}</button>)}
                  </div>
                </div>
                <div className="regime-control-group regime-control-group--horizon">
                  <span className="regime-control-group__label">Historical interval</span>
                  <div className="segmented-control segmented-control--compact" aria-label="Curve movement horizon">
                    {(["1W", "1M"] as CurveMoveHorizon[]).map((horizon) => <button className={regimeHorizon === horizon ? "segmented-control__button segmented-control__button--active" : "segmented-control__button"} type="button" key={horizon} aria-pressed={regimeHorizon === horizon} onClick={() => setRegimeHorizon(horizon)}>{horizon === "1W" ? "Weekly" : "Monthly"}</button>)}
                  </div>
                </div>
              </div>
              {renderEventMarkerControls()}
              {range.start && range.end ? <CurveRegimeTimeline key={`${selectedPair.key}-${regimeHorizon}-${range.start}-${range.end}`} rows={data.rows} pair={selectedPair} startDate={range.start} endDate={range.end} horizon={regimeHorizon} eventMarkers={showEventMarkers ? chartEventMarkers : []} highlightedEventId={highlightedEventId} /> : <div className="empty-state">Select a date range to map curve movement.</div>}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
