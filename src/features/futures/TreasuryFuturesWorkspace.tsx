import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  ExternalLink,
  Info,
  LineChart,
  RefreshCw
} from "lucide-react";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import type {
  DashboardMaturityKey,
  FuturesInstrument,
  FuturesMarketState,
  FuturesSeriesPoint
} from "@/domain/treasury/types";
import { useTreasuryFutures } from "./useTreasuryFutures";

const maturityColors: Record<DashboardMaturityKey, string> = {
  "2Y": "var(--series-2y)",
  "5Y": "var(--series-5y)",
  "10Y": "var(--series-10y)",
  "30Y": "var(--series-30y)"
};

const formatPrice = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(5) : "n/a";

const formatSigned = (value: number | null, decimals = 2) =>
  value === null ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(decimals)}`;

const formatThirtySeconds = (value: number | null) => {
  if (value === null) return "n/a";
  const formatted = value.toFixed(3).replace(/\.?0+$/, "");
  return `${value > 0 ? "+" : ""}${formatted} /32`;
};

const formatVolume = (value: number | null) => {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    notation: value >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100_000 ? 2 : 0
  }).format(value);
};

const formatExchangeTime = (value: string | number | null, includeDate = true) => {
  if (value === null) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";

  return new Intl.DateTimeFormat("en-US", {
    ...(includeDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short"
  }).format(date);
};

const formatChartTick = (timestamp: number) => {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  }).format(new Date(timestamp));
};

const contractMonth = (name: string) => {
  const match = name.match(/,([A-Za-z]{3})-(\d{4})$/);
  return match ? `${match[1]} ${match[2]}` : "Front continuous";
};

interface FuturesTooltipProps {
  active?: boolean;
  label?: number;
  payload?: Array<{
    value?: number;
    payload?: FuturesSeriesPoint;
  }>;
  previousClose: number | null;
  comparisonLabel: string;
}

function FuturesTooltip({ active, label, payload, previousClose, comparisonLabel }: FuturesTooltipProps) {
  const price = payload?.[0]?.payload?.price ?? payload?.[0]?.value;
  if (!active || typeof price !== "number" || typeof label !== "number") return null;
  const moveThirtySeconds = previousClose === null ? null : (price - previousClose) * 32;

  return (
    <div className="chart-tooltip chart-tooltip--futures">
      <span className="chart-tooltip__label">{formatExchangeTime(label)}</span>
      <div className="chart-tooltip__row">
        <span>Price</span>
        <strong>{formatPrice(price)}</strong>
      </div>
      {previousClose === null ? null : (
        <div className="chart-tooltip__row">
          <span>vs {comparisonLabel.toLowerCase()}</span>
          <strong>{formatThirtySeconds(moveThirtySeconds)}</strong>
        </div>
      )}
    </div>
  );
}

const rateDirectionLabel = (instrument: FuturesInstrument, sessionState: FuturesMarketState) => {
  if (instrument.rateDirection === "unavailable") return "Change unavailable";
  const prefix = sessionState === "open" ? "Yield tendency" : "Last quote: yield";
  if (instrument.rateDirection === "higher") return `${prefix} higher`;
  if (instrument.rateDirection === "lower") return `${prefix} lower`;
  return `${prefix} unchanged`;
};

export function TreasuryFuturesWorkspace() {
  const [selectedSymbol, setSelectedSymbol] = useState<FuturesInstrument["symbol"]>("ZN=F");
  const { data, error, isFetching, isLoading, refetch } = useTreasuryFutures("1D");
  const selected = data?.instruments.find((instrument) => instrument.symbol === selectedSymbol)
    ?? data?.instruments[0];

  useEffect(() => {
    if (data?.instruments.length && !data.instruments.some((instrument) => instrument.symbol === selectedSymbol)) {
      setSelectedSymbol(data.instruments[0].symbol);
    }
  }, [data?.instruments, selectedSymbol]);

  const chartDomain = useMemo<[number, number]>(() => {
    if (!selected?.series.length) return [0, 1];
    const prices = selected.series.map((point) => point.price);
    if (selected.previousClose !== null) prices.push(selected.previousClose);
    const minimum = Math.min(...prices);
    const maximum = Math.max(...prices);
    const padding = Math.max((maximum - minimum) * 0.12, selected.minTick * 2);
    return [minimum - padding, maximum + padding];
  }, [selected]);

  if (isLoading && !data) {
    return (
      <div className="workspace-panel" role="tabpanel" id="workspace-panel-futures" aria-labelledby="workspace-tab-futures" tabIndex={0}>
        <LoadingBlock className="panel futures-loading" rows={7} />
      </div>
    );
  }

  if (!data || !selected) {
    return (
      <div className="workspace-panel" role="tabpanel" id="workspace-panel-futures" aria-labelledby="workspace-tab-futures" tabIndex={0}>
        <div className="notice" role="alert">
          <strong>Delayed Treasury-futures feed unavailable.</strong>
          <span>{error instanceof Error ? error.message : "The official daily CMT dashboard remains available."}</span>
          <button className="text-button" type="button" onClick={() => refetch()}>
            <RefreshCw size={15} aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const chartColor = maturityColors[selected.key];
  const newestQuoteTime = data.instruments
    .map((instrument) => instrument.quoteTime)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const contractMarketStates = new Set(data.instruments.map((instrument) => instrument.marketState));
  const sessionState: FuturesMarketState | "mixed" = data.source.sessionCoherence === "mixed" || contractMarketStates.size > 1
    ? "mixed"
    : data.instruments.every((instrument) => instrument.marketState === "open")
      ? "open"
      : data.instruments.some((instrument) => instrument.marketState === "stale")
        ? "stale"
        : "closed";
  const sessionLabel = sessionState === "mixed"
    ? "Mixed contract freshness"
    : sessionState === "open"
      ? "CME session active"
      : sessionState === "stale"
        ? "No fresh session quote"
        : "CME session closed";
  const seriesLabel = data.source.seriesMode === "latest-session"
    ? "Latest available session · 5-minute bars"
    : data.source.seriesMode === "snapshot-only"
      ? "Delayed quote snapshot only"
      : `${data.range.intervalLabel} · delayed`;
  const comparisonLabel = selected.comparisonLabel;
  const dataStatus = [
    data.cache.warning,
    ...data.warnings,
    error instanceof Error ? error.message : null
  ].filter((message): message is string => Boolean(message)).join(" ");
  const dataStatusIsInformational = data.source.seriesMode === "latest-session"
    && !data.cache.warning
    && !(error instanceof Error);

  return (
    <div className="workspace-panel futures-workspace" role="tabpanel" id="workspace-panel-futures" aria-labelledby="workspace-tab-futures" tabIndex={0}>
      <header className="futures-header">
        <div>
          <p className="eyebrow">Intraday market proxy</p>
          <h2>CBOT Treasury Futures</h2>
          <p>Delayed exchange-traded rate-risk proxies. Prices are not CMT yields and never enter official curve analytics.</p>
        </div>
        <div className="futures-header__status" aria-live="polite">
          <span className={`futures-session futures-session--${sessionState}`}>
            <i aria-hidden="true" />
            {sessionLabel}
          </span>
          <span><Clock3 size={13} aria-hidden="true" /> Latest quote {formatExchangeTime(newestQuoteTime)}</span>
          <span>{seriesLabel}{data.source.latestTradeDate ? ` · latest trade date ${data.source.latestTradeDate}` : ""}</span>
        </div>
      </header>

      {dataStatus ? (
        <div className={`notice futures-warning${dataStatusIsInformational ? " futures-warning--info" : " notice--warning"}`} role="status">
          <strong>{dataStatusIsInformational ? "Chart coverage." : "Futures data status."}</strong>
          <span>{dataStatus}</span>
        </div>
      ) : null}

      <div className="futures-toolbar">
        <span>Intraday price tape</span>
        <div className="futures-toolbar__actions">
          <span className="futures-toolbar__interval">
            {data.source.seriesMode === "latest-session" ? "Latest session" : data.range.key} · {data.range.intervalLabel}
          </span>
          <button className="icon-button" type="button" onClick={() => refetch()} aria-label="Refresh delayed futures data" title="Refresh delayed futures data">
            <RefreshCw size={16} className={isFetching ? "spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="futures-tape" aria-label="Treasury futures contracts">
        {data.instruments.map((instrument) => {
          const DirectionIcon = instrument.rateDirection === "higher" ? ArrowUpRight : ArrowDownRight;
          return (
            <button
              className={`futures-contract futures-contract--${instrument.key.toLowerCase()}${instrument.symbol === selected.symbol ? " futures-contract--active" : ""}`}
              type="button"
              key={instrument.symbol}
              aria-pressed={instrument.symbol === selected.symbol}
              onClick={() => setSelectedSymbol(instrument.symbol)}
            >
              <span className="futures-contract__heading">
                <span><strong>{instrument.shortLabel}</strong><small>{instrument.symbol}</small></span>
                <em>{contractMonth(instrument.contractName)}</em>
              </span>
              <span className="futures-contract__quote">
                <strong>{formatPrice(instrument.price)}</strong>
                <small>{formatThirtySeconds(instrument.changeThirtySeconds)} · {instrument.priceChangePct === null ? "change n/a" : `${formatSigned(instrument.priceChangePct)}%`}</small>
              </span>
              <span className={`futures-contract__direction futures-contract__direction--${instrument.rateDirection}`}>
                {instrument.rateDirection === "unchanged" || instrument.rateDirection === "unavailable" ? null : <DirectionIcon size={14} aria-hidden="true" />}
                {rateDirectionLabel(instrument, instrument.marketState)}
              </span>
              <span className="futures-contract__micro">
                <span>Range {formatPrice(instrument.dayLow)}-{formatPrice(instrument.dayHigh)}</span>
                <span>Vol {formatVolume(instrument.volume)}</span>
                <span className={`futures-contract__state futures-contract__state--${instrument.marketState}`}>
                  {instrument.marketState === "open" ? "Fresh" : instrument.marketState === "stale" ? "Stale" : "Closed"}
                  {instrument.tradeDate ? ` · ${instrument.tradeDate}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="futures-layout">
        <article className="panel futures-chart-panel">
          <div className="panel__header futures-chart-panel__header">
            <div>
              <p className="eyebrow">{selected.symbol} · {contractMonth(selected.contractName)}</p>
              <h3>{selected.label} Futures Price</h3>
            </div>
            <div className="futures-chart-panel__quote">
              <strong>{formatPrice(selected.price)}</strong>
              <span className={`futures-chart-panel__change futures-chart-panel__change--${selected.rateDirection}`}>
                {formatThirtySeconds(selected.changeThirtySeconds)} · {selected.priceChangePct === null ? "change n/a" : `${formatSigned(selected.priceChangePct)}%`}
              </span>
            </div>
          </div>

          {selected.series.length >= 2 ? (
            <div className="futures-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selected.series} margin={{ top: 14, right: 12, bottom: 4, left: 2 }}>
                  <defs>
                    <linearGradient id={`futures-gradient-${selected.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColor} stopOpacity={0.19} />
                      <stop offset="100%" stopColor={chartColor} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    minTickGap={48}
                    tickFormatter={(value) => formatChartTick(Number(value))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                  />
                  <YAxis
                    orientation="right"
                    domain={chartDomain}
                    width={58}
                    tickFormatter={(value) => Number(value).toFixed(3)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                  />
                  <Tooltip
                    content={<FuturesTooltip previousClose={selected.previousClose} comparisonLabel={comparisonLabel} />}
                    cursor={{ stroke: "var(--chart-crosshair)", strokeWidth: 1, strokeDasharray: "3 4" }}
                  />
                  {selected.previousClose === null ? null : <ReferenceLine y={selected.previousClose} stroke="var(--zero-line)" strokeDasharray="5 5" label={{ value: comparisonLabel, position: "insideTopLeft", fill: "var(--subtle)", fontSize: 9 }} />}
                  <Area
                    type="linear"
                    dataKey="price"
                    stroke={chartColor}
                    strokeWidth={2}
                    fill={`url(#futures-gradient-${selected.key})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="futures-chart-empty" role="status">
              <LineChart size={19} aria-hidden="true" />
              <div>
                <strong>Intraday chart unavailable</strong>
                <span>{selected.series.length === 1 ? "Only one verified session bar is available, so no intraday path or prior-session move is shown." : `Yahoo returned a delayed quote snapshot for ${selected.symbol}, but no verified bars.`} The quote tape remains separate from official CMT analytics.</span>
              </div>
            </div>
          )}

          <dl className="futures-chart-stats">
            <div><dt>{comparisonLabel}</dt><dd>{formatPrice(selected.previousClose)}</dd></div>
            <div><dt>Session low</dt><dd>{formatPrice(selected.dayLow)}</dd></div>
            <div><dt>Session high</dt><dd>{formatPrice(selected.dayHigh)}</dd></div>
            <div><dt>Reported volume</dt><dd>{formatVolume(selected.volume)}</dd></div>
          </dl>
        </article>

        <aside className="panel futures-methodology">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Rate interpretation</p>
              <h3>Price and Yield Move Inversely</h3>
            </div>
          </div>
          <div className="futures-inverse-map" aria-label="Futures price and yield direction relationship">
            <div className="futures-inverse-map__row futures-inverse-map__row--lower" aria-label="Futures price higher implies a lower yield tendency">
              <span>Futures price <ArrowUpRight size={15} aria-hidden="true" /></span>
              <strong>Yield tendency <ArrowDownRight size={15} aria-hidden="true" /></strong>
            </div>
            <div className="futures-inverse-map__row futures-inverse-map__row--higher" aria-label="Futures price lower implies a higher yield tendency">
              <span>Futures price <ArrowDownRight size={15} aria-hidden="true" /></span>
              <strong>Yield tendency <ArrowUpRight size={15} aria-hidden="true" /></strong>
            </div>
          </div>
          <div className="futures-methodology__notes">
            <p><Info size={14} aria-hidden="true" /><span>Each contract tracks a deliverable Treasury basket and is primarily driven by its cheapest-to-deliver security. Ultra Bond uses a 25Y+ basket; it is a 30Y-sector proxy, not the 30Y CMT.</span></p>
            <p><Info size={14} aria-hidden="true" /><span>Raw price moves are not comparable across tenors because duration, DV01, conversion factors, and contract size differ.</span></p>
            <p><Info size={14} aria-hidden="true" /><span>No futures price is converted into a CMT yield, spread, regime, statistic, or CSV field in this dashboard.</span></p>
          </div>
          <div className="futures-methodology__links">
            <a href={data.source.methodologyUrl} target="_blank" rel="noreferrer">CME methodology <ExternalLink size={12} aria-hidden="true" /></a>
            <a href={data.source.pageUrl} target="_blank" rel="noreferrer">Yahoo market page <ExternalLink size={12} aria-hidden="true" /></a>
          </div>
        </aside>
      </div>

      <div className="workspace-source-strip futures-source-strip">
        <span>{data.source.name}. Indicative delayed reference; availability and delay are determined by Yahoo Finance and its exchange-data providers.</span>
        <span>
          {data.source.seriesAsOf ? `Series through ${formatExchangeTime(data.source.seriesAsOf)} · ` : ""}
          Retrieved {formatExchangeTime(data.source.retrievedAt)} · not official CMT
        </span>
      </div>
    </div>
  );
}
