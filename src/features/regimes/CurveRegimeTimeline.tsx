import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Info, MoveRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  buildCurveMoveForDates,
  buildCurveRegimeTimeline,
  currentSpreadForPair,
  curveMoveShapeToleranceBps,
  curveMoveTypes,
  findPairObservationOnOrBefore,
  getComparisonTargetDate,
  type CurveComparisonHorizon,
  type CurveMoveClassification,
  type CurveMoveHorizon,
  type CurveMoveType,
  type CurvePair,
  type CurveRegimePoint,
  type MacroEvent
} from "@/domain/treasury/research";
import type { HistoricalRow } from "@/domain/treasury/types";
import { formatBps, formatDate } from "@/utils/format";

interface ChartEventMarker {
  event: MacroEvent;
  markerDate: string;
}

interface CurveRegimeTimelineProps {
  rows: HistoricalRow[];
  pair: CurvePair;
  startDate: string;
  endDate: string;
  horizon: CurveMoveHorizon;
  eventMarkers?: ChartEventMarker[];
  highlightedEventId?: string | null;
}

interface SpreadChartPoint {
  date: string;
  spreadBps: number | null;
  regimeType: CurveMoveClassification | null;
  selectedSpreadBps?: number | null;
  [seriesKey: string]: string | number | null | undefined;
}

interface SelectedRegimeWindow {
  type: CurveMoveClassification;
  startDate: string;
  endDate: string;
}

interface RegimeEpisode {
  id: string;
  type: CurveMoveClassification;
  startDate: string;
  endDate: string;
  durationDays: number;
  points: CurveRegimePoint[];
}

interface EpisodeMove {
  shortDeltaBps: number;
  longDeltaBps: number;
  spreadDeltaBps: number;
  levelDeltaBps: number;
}

type AnalysisWindow = CurveComparisonHorizon | "RANGE" | "CUSTOM";

const analysisWindows: Array<{ key: Exclude<AnalysisWindow, "CUSTOM">; label: string }> = [
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1Y", label: "1Y" },
  { key: "RANGE", label: "Range start" }
];

const slopeToleranceOptions = [0, 3, 5, 10];

const typeColor: Record<CurveMoveClassification, string> = {
  "Bull steepening": "var(--regime-bull-steepening)",
  "Bear steepening": "var(--regime-bear-steepening)",
  "Bull flattening": "var(--regime-bull-flattening)",
  "Bear flattening": "var(--regime-bear-flattening)",
  "Parallel shift higher": "var(--regime-parallel-higher)",
  "Parallel shift lower": "var(--regime-parallel-lower)",
  "Neutral / unclassified": "var(--chart-regime-neutral)"
};

type RegimeShape = "steepening" | "flattening" | "parallel" | "neutral";

const regimeShape = (type: CurveMoveClassification): RegimeShape => {
  if (type === "Neutral / unclassified") return "neutral";
  if (type.includes("steepening")) return "steepening";
  if (type.includes("flattening")) return "flattening";
  return "parallel";
};

const regimeStrokeDash: Record<CurveMoveClassification, string | undefined> = {
  "Bull steepening": undefined,
  "Bear steepening": undefined,
  "Bull flattening": "7 3",
  "Bear flattening": "7 3",
  "Parallel shift higher": "1 4",
  "Parallel shift lower": "1 4",
  "Neutral / unclassified": "3 4"
};

const regimeDomKey: Record<CurveMoveClassification, string> = {
  "Bull steepening": "bull-steepening",
  "Bear steepening": "bear-steepening",
  "Bull flattening": "bull-flattening",
  "Bear flattening": "bear-flattening",
  "Parallel shift lower": "parallel-lower",
  "Parallel shift higher": "parallel-higher",
  "Neutral / unclassified": "neutral"
};

const regimeColorGroups: Array<{
  label: string;
  shape: RegimeShape;
  rule: (toleranceBps: number, spreadLabel: string) => string;
  moves: Array<{ type: CurveMoveType; label: string; direction: string }>;
}> = [
  {
    label: "Steepening",
    shape: "steepening",
    rule: (toleranceBps, spreadLabel) => `Δ${spreadLabel} > +${toleranceBps} bps`,
    moves: [
      { type: "Bull steepening", label: "Bull", direction: "Pair avg Δ < 0" },
      { type: "Bear steepening", label: "Bear", direction: "Pair avg Δ > 0" }
    ]
  },
  {
    label: "Flattening",
    shape: "flattening",
    rule: (toleranceBps, spreadLabel) => `Δ${spreadLabel} < -${toleranceBps} bps`,
    moves: [
      { type: "Bull flattening", label: "Bull", direction: "Pair avg Δ < 0" },
      { type: "Bear flattening", label: "Bear", direction: "Pair avg Δ > 0" }
    ]
  },
  {
    label: "Near-parallel",
    shape: "parallel",
    rule: (toleranceBps, spreadLabel) => `|Δ${spreadLabel}| ≤ ${toleranceBps} bps`,
    moves: [
      { type: "Parallel shift lower", label: "Lower", direction: "Pair avg Δ < 0" },
      { type: "Parallel shift higher", label: "Higher", direction: "Pair avg Δ > 0" }
    ]
  }
];

const compactDateTick = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(value);
};

const intervalLabel = (startDate: string, endDate: string) => `${formatDate(startDate)} to ${formatDate(endDate)}`;

const regimeStyle = (type: CurveMoveClassification) => ({ "--regime-color": typeColor[type] }) as CSSProperties;

const regimeSeriesKey = (type: CurveMoveType) => `regime-${type}`;

const periodNoun = (horizon: CurveMoveHorizon) => horizon === "1W" ? "week" : "month";

const analysisWindowLabel = (window: AnalysisWindow) => {
  if (window === "RANGE") return "Range start";
  if (window === "CUSTOM") return "Custom dates";
  return window;
};

const previousCalendarDate = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

const aggregateEpisodeMove = (episode: RegimeEpisode): EpisodeMove =>
  episode.points.reduce<EpisodeMove>(
    (total, point) => ({
      shortDeltaBps: total.shortDeltaBps + point.shortDeltaBps,
      longDeltaBps: total.longDeltaBps + point.longDeltaBps,
      spreadDeltaBps: total.spreadDeltaBps + point.spreadDeltaBps,
      levelDeltaBps: total.levelDeltaBps + point.levelDeltaBps
    }),
    { shortDeltaBps: 0, longDeltaBps: 0, spreadDeltaBps: 0, levelDeltaBps: 0 }
  );

const buildEpisodes = (timeline: CurveRegimePoint[]): RegimeEpisode[] => {
  const episodes: RegimeEpisode[] = [];

  timeline.forEach((point) => {
    const previous = episodes.at(-1);
    const continuesPrevious = previous?.type === point.type && previous.endDate === point.comparisonDate;

    if (continuesPrevious && previous) {
      previous.endDate = point.date;
      previous.points.push(point);
      return;
    }

    episodes.push({
      id: `${point.type}-${point.comparisonDate}-${point.date}`,
      type: point.type,
      startDate: point.comparisonDate,
      endDate: point.date,
      durationDays: 0,
      points: [point]
    });
  });

  return episodes.map((episode) => ({
    ...episode,
    durationDays: Math.max(
      1,
      Math.round(
        (new Date(`${episode.endDate}T00:00:00Z`).getTime() - new Date(`${episode.startDate}T00:00:00Z`).getTime()) / 86_400_000
      )
    )
  }));
};

interface SpreadTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: SpreadChartPoint }>;
  selectedWindow: SelectedRegimeWindow | null;
}

function SpreadTooltip({ active, payload, selectedWindow }: SpreadTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.spreadBps === null) return null;
  const isSelected = Boolean(selectedWindow && point.date >= selectedWindow.startDate && point.date <= selectedWindow.endDate);
  const accentType = isSelected ? selectedWindow?.type : point.regimeType;

  return (
    <div className="chart-tooltip chart-tooltip--regime" style={accentType ? regimeStyle(accentType) : undefined}>
      <span className="chart-tooltip__label">{formatDate(point.date)}</span>
      <div className="chart-tooltip__rows">
        <div className="chart-tooltip__row"><span>Curve spread</span><strong>{point.spreadBps.toFixed(1)} bps</strong></div>
        {isSelected && selectedWindow ? <div className="chart-tooltip__row"><span>Selected comparison</span><RegimeBadge type={selectedWindow.type} /></div> : null}
        {point.regimeType
          ? <div className="chart-tooltip__row"><span>Calendar-period regime</span><RegimeBadge type={point.regimeType} /></div>
          : <div className="chart-tooltip__row"><span>Calendar period</span><strong>Open / unclassified</strong></div>}
      </div>
    </div>
  );
}

function RegimeBadge({ type }: { type: CurveMoveClassification }) {
  return (
    <span className="regime-badge" style={regimeStyle(type)}>
      <span className="regime-badge__glyph" aria-hidden="true"><RegimeGlyph type={type} /></span>
      <span>{type}</span>
    </span>
  );
}

function RegimeGlyph({ type, size = 13 }: { type: CurveMoveClassification; size?: number }) {
  if (type === "Neutral / unclassified") return <MoveRight size={size} strokeWidth={2.2} />;
  const shape = regimeShape(type);
  if (shape === "steepening") return <TrendingUp size={size} strokeWidth={2.2} />;
  if (shape === "flattening") return <TrendingDown size={size} strokeWidth={2.2} />;
  return <MoveRight size={size} strokeWidth={2.2} />;
}

function HelpTip({ label }: { label: string }) {
  return (
    <button className="regime-help" type="button" aria-label={label} data-tooltip={label}>
      <Info size={13} aria-hidden="true" />
    </button>
  );
}

const setRegimePreview = (control: HTMLButtonElement, type: CurveMoveType | null) => {
  const panel = control.closest<HTMLElement>(".regime-panel");
  if (!panel) return;
  if (type) panel.dataset.hoverRegime = regimeDomKey[type];
  else delete panel.dataset.hoverRegime;
};

export function CurveRegimeTimeline({ rows, pair, startDate, endDate, horizon, eventMarkers = [], highlightedEventId = null }: CurveRegimeTimelineProps) {
  const [slopeToleranceBps, setSlopeToleranceBps] = useState(curveMoveShapeToleranceBps[horizon]);
  const timeline = useMemo(
    () => buildCurveRegimeTimeline(rows, pair, startDate, endDate, horizon, slopeToleranceBps),
    [endDate, horizon, pair, rows, slopeToleranceBps, startDate]
  );
  const rawSpreadSeries = useMemo(
    () => rows
      .filter((row) => row.date >= startDate && row.date <= endDate)
      .map((row) => ({ date: row.date, spreadBps: currentSpreadForPair(row, pair) })),
    [endDate, pair, rows, startDate]
  );
  const rangeMove = useMemo(
    () => buildCurveMoveForDates(rows, pair, endDate, startDate, slopeToleranceBps),
    [endDate, pair, rows, slopeToleranceBps, startDate]
  );
  const episodes = useMemo(() => buildEpisodes(timeline), [timeline]);
  const spreadSeries = useMemo<SpreadChartPoint[]>(
    () => rawSpreadSeries.map((point) => {
      const matchingEpisode = episodes.find((episode) => point.date >= episode.startDate && point.date <= episode.endDate);
      const regimeType = matchingEpisode?.type ?? null;

      return {
        ...point,
        regimeType,
        ...(regimeType && regimeType !== "Neutral / unclassified" ? { [regimeSeriesKey(regimeType)]: point.spreadBps } : {})
      };
    }),
    [episodes, rawSpreadSeries]
  );
  const [asOfDate, setAsOfDate] = useState(endDate);
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindow>("1M");
  const [customReferenceDate, setCustomReferenceDate] = useState(startDate);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [pinnedRegime, setPinnedRegime] = useState<CurveMoveType | null>(null);

  useEffect(() => {
    setSlopeToleranceBps(curveMoveShapeToleranceBps[horizon]);
    setAsOfDate((current) => !current || current < startDate || current > endDate ? endDate : current);
    setCustomReferenceDate((current) => !current || current < startDate || current >= endDate ? startDate : current);
    setSelectedEpisodeId(null);
    setPinnedRegime(null);
  }, [endDate, horizon, pair.key, startDate]);

  const analysisReferenceTarget = useMemo(() => {
    if (analysisWindow === "RANGE") return startDate;
    if (analysisWindow === "CUSTOM") return customReferenceDate;
    return getComparisonTargetDate(asOfDate, analysisWindow);
  }, [analysisWindow, asOfDate, customReferenceDate, startDate]);
  const analysisAsOf = useMemo(
    () => findPairObservationOnOrBefore(rows, pair, asOfDate),
    [asOfDate, pair, rows]
  );
  const analysisToleranceBps = slopeToleranceBps;
  const analysisMove = useMemo(
    () => analysisAsOf
      ? buildCurveMoveForDates(rows, pair, analysisAsOf.date, analysisReferenceTarget, analysisToleranceBps)
      : null,
    [analysisAsOf, analysisReferenceTarget, analysisToleranceBps, pair, rows]
  );

  const selectedEpisode = episodes.find((episode) => episode.id === selectedEpisodeId);
  const rangeEndPoint = [...spreadSeries].reverse().find((point) => point.spreadBps !== null);
  const counts = useMemo(
    () => Object.fromEntries(curveMoveTypes.map((type) => [type, timeline.filter((point) => point.type === type).length])) as Record<CurveMoveType, number>,
    [timeline]
  );
  const neutralCount = useMemo(
    () => timeline.filter((point) => point.type === "Neutral / unclassified").length,
    [timeline]
  );
  const selectedWindow = useMemo<SelectedRegimeWindow | null>(
    () => analysisMove && analysisAsOf
      ? { type: analysisMove.type, startDate: analysisMove.comparisonDate, endDate: analysisAsOf.date }
      : null,
    [analysisAsOf, analysisMove]
  );
  const chartSeries = useMemo<SpreadChartPoint[]>(
    () => spreadSeries.map((point) => ({
      ...point,
      selectedSpreadBps: selectedWindow && point.date >= selectedWindow.startDate && point.date <= selectedWindow.endDate
        ? point.spreadBps
        : null
    })),
    [selectedWindow, spreadSeries]
  );
  const highlightedRegime = pinnedRegime;

  if (!spreadSeries.some((point) => point.spreadBps !== null)) {
    return <div className="empty-state">No valid observations are available for this segment and range.</div>;
  }

  const noun = periodNoun(horizon);
  const asOfRecordDate = analysisAsOf?.date ?? asOfDate;
  const setAnalysisEndDate = (value: string) => {
    setAsOfDate(value);
    setCustomReferenceDate((current) => current < value ? current : startDate);
    setSelectedEpisodeId(null);
  };
  const handleEpisodeSelect = (episode: RegimeEpisode) => {
    setSelectedEpisodeId(episode.id);
    setAsOfDate(episode.endDate);
    setCustomReferenceDate(episode.startDate);
    setAnalysisWindow("CUSTOM");
  };

  return (
    <article className="panel regime-panel" data-pinned-regime={pinnedRegime ? regimeDomKey[pinnedRegime] : undefined}>
      <div className="panel__header">
        <div>
          <p className="eyebrow">Ex-post historical curve regimes</p>
          <h3>{pair.longLabel} regime map</h3>
        </div>
        <span className="panel__meta">{horizon === "1W" ? "Weekly" : "Monthly"} calendar intervals</span>
      </div>

      <div className="regime-analysis-controls" role="group" aria-label="As-of curve-regime analysis">
        <div className="regime-analysis-controls__date">
          <div className="regime-field-label">
            <label htmlFor="regime-end-date">End date</label>
            <HelpTip label="The valid observation at which the selected two-tenor move ends." />
          </div>
          <input
            id="regime-end-date"
            type="date"
            min={startDate}
            max={endDate}
            value={asOfDate}
            onChange={(event) => setAnalysisEndDate(event.target.value)}
            onInput={(event) => setAnalysisEndDate(event.currentTarget.value)}
          />
        </div>
        <div className="regime-analysis-controls__window">
          <div className="regime-field-label">
            <span>Lookback</span>
            <HelpTip label="The reference period used to classify the selected curve move. Custom dates uses the start date field." />
          </div>
          <div className="regime-analysis-window" aria-label="As-of comparison window">
            {analysisWindows.map((window) => (
              <button
                className={analysisWindow === window.key ? "regime-analysis-window__button regime-analysis-window__button--active" : "regime-analysis-window__button"}
                type="button"
                key={window.key}
                aria-pressed={analysisWindow === window.key}
                onClick={() => {
                  setAnalysisWindow(window.key);
                  setSelectedEpisodeId(null);
                }}
              >
                {window.label}
              </button>
            ))}
            <button
              className={analysisWindow === "CUSTOM" ? "regime-analysis-window__button regime-analysis-window__button--active" : "regime-analysis-window__button"}
              type="button"
              aria-pressed={analysisWindow === "CUSTOM"}
              onClick={() => {
                setAnalysisWindow("CUSTOM");
                setSelectedEpisodeId(null);
              }}
            >
              Custom dates
            </button>
          </div>
        </div>
        {analysisWindow === "CUSTOM" ? (
          <div className="regime-analysis-controls__date">
            <div className="regime-field-label">
              <label htmlFor="regime-start-date">Start date</label>
              <HelpTip label="The valid observation from which a custom date-to-date curve move is measured." />
            </div>
            <input
              id="regime-start-date"
              type="date"
              min={startDate}
              max={previousCalendarDate(asOfDate)}
              value={customReferenceDate}
              onChange={(event) => {
                setCustomReferenceDate(event.target.value);
                setSelectedEpisodeId(null);
              }}
              onInput={(event) => {
                setCustomReferenceDate(event.currentTarget.value);
                setSelectedEpisodeId(null);
              }}
            />
          </div>
        ) : null}
        <div className="regime-analysis-controls__tolerance">
          <div className="regime-field-label">
            <span>Slope tolerance</span>
            <HelpTip label="Project-defined absolute slope-change threshold used to separate near-parallel moves from steepening or flattening. Changing it recomputes every visible count." />
          </div>
          <div className="regime-analysis-window" aria-label="Slope tolerance sensitivity">
            {slopeToleranceOptions.map((value) => (
              <button
                className={slopeToleranceBps === value ? "regime-analysis-window__button regime-analysis-window__button--active" : "regime-analysis-window__button"}
                type="button"
                key={value}
                aria-pressed={slopeToleranceBps === value}
                onClick={() => {
                  setSlopeToleranceBps(value);
                  setSelectedEpisodeId(null);
                }}
              >
                {value} bps
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="regime-summary">
        <div className="regime-summary__tile regime-summary__tile--regime" style={analysisMove ? regimeStyle(analysisMove.type) : undefined}>
          <span>Selected period regime</span>
          {analysisMove ? <RegimeBadge type={analysisMove.type} /> : <strong>n/a</strong>}
          <small>{analysisMove ? `${intervalLabel(analysisMove.comparisonDate, asOfRecordDate)} · slope change ${formatBps(analysisMove.spreadDeltaBps)}` : "Select a valid reference period"}</small>
        </div>
        <div className="regime-summary__tile">
          <span>Visible-range net slope change</span>
          <strong>{formatBps(rangeMove?.spreadDeltaBps)}</strong>
          <small>{rangeMove ? `${rangeMove.type} · ${formatDate(rangeMove.comparisonDate)} to ${formatDate(rangeEndPoint?.date ?? endDate)}` : "Insufficient pair observations"}</small>
        </div>
        <div className="regime-summary__tile">
          <span>Range-end {pair.label} spread</span>
          <strong>{rangeEndPoint?.spreadBps?.toFixed(1) ?? "n/a"} bps</strong>
          <small>As of {formatDate(rangeEndPoint?.date)}</small>
        </div>
      </div>

      <div className="regime-key__intro" id="regime-color-key-title">
        <span><strong>Regime encoding</strong> · Cool = pair average lower · Warm = pair average higher · Glyph and stroke = slope direction · <i aria-hidden="true" /> Gray = neutral or open</span>
        <div className="regime-key__scope">
          <button
            type="button"
            className={!pinnedRegime ? "regime-key__all regime-key__all--active" : "regime-key__all"}
            aria-pressed={!pinnedRegime}
            onClick={() => setPinnedRegime(null)}
          >
            All regimes
          </button>
          <span>Six directional regimes · {neutralCount} neutral excluded · completed {noun}s</span>
        </div>
      </div>
      <div className="regime-key" aria-labelledby="regime-color-key-title">
        {regimeColorGroups.map((group) => (
          <div className="regime-key__group" key={group.label} data-shape={group.shape}>
            <div className="regime-key__heading">
              <strong>{group.label}</strong>
              <span>{group.rule(slopeToleranceBps, pair.label.replaceAll(" ", ""))}</span>
            </div>
            <div className="regime-key__moves">
              {group.moves.map((move) => {
                const isPinned = pinnedRegime === move.type;
                const isHighlighted = highlightedRegime === move.type;
                const isMuted = highlightedRegime !== null && !isHighlighted;

                return (
                  <button
                    type="button"
                    className={`regime-key__move${isPinned ? " regime-key__move--pinned" : ""}${isHighlighted ? " regime-key__move--highlighted" : ""}${isMuted ? " regime-key__move--muted" : ""}`}
                    key={move.type}
                    style={regimeStyle(move.type)}
                    data-regime={regimeDomKey[move.type]}
                    aria-label={`${move.type}: ${counts[move.type]} completed ${noun} classifications. ${isPinned ? "Remove filter" : "Isolate regime"}.`}
                    aria-pressed={isPinned}
                    title={`${move.type} · click to isolate`}
                    onPointerEnter={(event) => setRegimePreview(event.currentTarget, move.type)}
                    onPointerLeave={(event) => setRegimePreview(event.currentTarget, null)}
                    onFocus={(event) => setRegimePreview(event.currentTarget, move.type)}
                    onBlur={(event) => setRegimePreview(event.currentTarget, null)}
                    onClick={() => setPinnedRegime((current) => current === move.type ? null : move.type)}
                  >
                    <span className="regime-key__glyph" aria-hidden="true"><RegimeGlyph type={move.type} size={14} /></span>
                    <span><strong>{move.label}</strong><small>{move.direction}</small></span>
                    <b>{counts[move.type]}</b>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="regime-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartSeries} margin={{ top: 14, right: 20, bottom: 6, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
            <XAxis dataKey="date" minTickGap={42} tickFormatter={compactDateTick} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={76} tickFormatter={(value) => `${Number(value).toFixed(0)} bps`} tick={{ fill: "var(--muted)", fontSize: 12 }} />
            <Tooltip content={<SpreadTooltip selectedWindow={selectedWindow} />} cursor={{ stroke: "var(--chart-crosshair)", strokeWidth: 1, strokeDasharray: "3 4" }} />
            <ReferenceLine y={0} stroke="var(--zero-line)" strokeDasharray="4 5" />
            {eventMarkers.map(({ event, markerDate }) => {
              const isHighlighted = highlightedEventId === event.id;
              return (
                <ReferenceLine
                  key={`event-${event.id}`}
                  x={markerDate}
                  stroke={isHighlighted ? "var(--chart-highlight)" : "var(--event-line)"}
                  strokeWidth={isHighlighted ? 2 : 1}
                  strokeDasharray="4 6"
                  label={isHighlighted ? { value: event.title, position: "insideTopLeft", fill: "var(--ink)", fontSize: 11 } : undefined}
                />
              );
            })}
            {analysisMove && analysisAsOf ? (
              <ReferenceArea
                x1={analysisMove.comparisonDate}
                x2={analysisAsOf.date}
                fill={typeColor[analysisMove.type]}
                fillOpacity={0.08}
                stroke={typeColor[analysisMove.type]}
                strokeOpacity={0.55}
                strokeDasharray="3 4"
                ifOverflow="hidden"
              />
            ) : null}
            <Line
              type="linear"
              className="regime-chart__base-outline"
              dataKey="spreadBps"
              name={`${pair.label} outline`}
              stroke="var(--chart-path-outline)"
              strokeWidth={5}
              strokeOpacity={highlightedRegime ? 0.45 : 1}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              legendType="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              type="linear"
              className="regime-chart__base"
              dataKey="spreadBps"
              name={pair.label}
              stroke="var(--chart-regime-neutral)"
              strokeWidth={2.1}
              strokeOpacity={highlightedRegime ? 0.22 : 1}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {curveMoveTypes.map((type) => (
              <Line
                key={type}
                type="linear"
                className={`regime-chart__line regime-chart__line--${regimeDomKey[type]}`}
                dataKey={regimeSeriesKey(type)}
                name={type}
                stroke={typeColor[type]}
                strokeWidth={highlightedRegime === type ? 4.4 : 3.2}
                strokeOpacity={!highlightedRegime || highlightedRegime === type ? 1 : 0.1}
                strokeDasharray={regimeStrokeDash[type]}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {analysisMove ? (
              <>
                <Line
                  type="linear"
                  className={`regime-chart__selection regime-chart__selection--${regimeDomKey[analysisMove.type]}`}
                  dataKey="selectedSpreadBps"
                  name="Selected comparison outline"
                  stroke="var(--chart-path-outline)"
                  strokeWidth={7}
                  strokeOpacity={!highlightedRegime || highlightedRegime === analysisMove.type ? 1 : 0.18}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Line
                  type="linear"
                  className={`regime-chart__selection regime-chart__selection--${regimeDomKey[analysisMove.type]}`}
                  dataKey="selectedSpreadBps"
                  name={`Selected comparison · ${analysisMove.type}`}
                  stroke={typeColor[analysisMove.type]}
                  strokeWidth={4.2}
                  strokeOpacity={!highlightedRegime || highlightedRegime === analysisMove.type ? 1 : 0.18}
                  strokeDasharray={regimeStrokeDash[analysisMove.type]}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="regime-ribbon-wrap">
        <div className="regime-ribbon__header">
          <span>Completed {noun} regimes <HelpTip label={`Each colored block is a completed ${noun} move. Select a block to load its exact dates as a custom comparison.`} /></span>
          <span>{timeline.length ? intervalLabel(timeline[0].comparisonDate, timeline.at(-1)?.date ?? endDate) : "No completed intervals in view"}</span>
        </div>
        <div className="regime-ribbon" aria-label={`${horizon} curve-regime intervals`}>
          {episodes.length ? episodes.map((episode) => {
            const move = aggregateEpisodeMove(episode);
            const isSelected = episode.id === selectedEpisode?.id;
            const isHighlighted = highlightedRegime === episode.type;
            const isMuted = highlightedRegime !== null && !isHighlighted;
            const pluralizedPeriods = episode.points.length === 1 ? `${noun}` : `${noun}s`;
            const label = `${episode.type}, ${episode.points.length} consecutive ${pluralizedPeriods}, ${intervalLabel(episode.startDate, episode.endDate)}, slope ${formatBps(move.spreadDeltaBps)}`;

            return (
              <button
                key={episode.id}
                type="button"
                className={`regime-ribbon__segment${isSelected ? " regime-ribbon__segment--active" : ""}${isHighlighted ? " regime-ribbon__segment--highlighted" : ""}${isMuted ? " regime-ribbon__segment--muted" : ""}`}
                style={{ ...regimeStyle(episode.type), flexGrow: episode.durationDays } as CSSProperties}
                data-shape={regimeShape(episode.type)}
                data-regime={regimeDomKey[episode.type]}
                onClick={() => handleEpisodeSelect(episode)}
                aria-label={label}
                aria-pressed={isSelected}
                title={label}
              />
            );
          }) : <span className="regime-ribbon__empty">No completed calendar {noun}s</span>}
        </div>
      </div>

      {analysisMove ? (
        <section className="regime-inspector regime-inspector--coded" style={regimeStyle(analysisMove.type)} aria-live="polite">
          <div className="regime-inspector__heading">
            <div>
              <span>As-of decomposition · {analysisWindowLabel(analysisWindow)}</span>
              <RegimeBadge type={analysisMove.type} />
              <small>{intervalLabel(analysisMove.comparisonDate, asOfRecordDate)} · {analysisToleranceBps} bps slope-change tolerance</small>
            </div>
            <p>{analysisMove.rationale}</p>
          </div>
          <dl className="regime-inspector__metrics">
            <div><dt>{pair.shortKey} yield change</dt><dd>{formatBps(analysisMove.shortDeltaBps)}</dd></div>
            <div><dt>{pair.longKey} yield change</dt><dd>{formatBps(analysisMove.longDeltaBps)}</dd></div>
            <div><dt>Pair average move</dt><dd>{formatBps(analysisMove.levelDeltaBps)}</dd></div>
            <div><dt>Pair slope change</dt><dd>{formatBps(analysisMove.spreadDeltaBps)}</dd></div>
          </dl>
        </section>
      ) : null}

      <div className="spread-note">
        <Info size={15} aria-hidden="true" />
        <span>
          Colors are ex-post classifications of completed calendar periods, not contemporaneous trading signals. The chart highlight is the selected date-to-date comparison; the ribbon is completed-period history. Pair average move is the average of the selected-tenor yield changes; pair slope change is the change in the long-minus-short spread. A positive pair average is bear/higher, a negative average is bull/lower, and an exactly zero average is neutral and excluded from the six directional counts. Near-parallel applies only when the pair&apos;s slope change is within the stated project-defined tolerance, not to the full Treasury curve.
        </span>
      </div>
    </article>
  );
}
