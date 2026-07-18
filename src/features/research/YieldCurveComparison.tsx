import { useMemo, useState, type CSSProperties } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CalendarRange, ChevronDown, ChevronUp, HelpCircle, Info, X } from "lucide-react";
import {
  buildCurveMove,
  curveMoveShapeToleranceBps,
  curvePairs,
  findCompleteCurveObservationOnOrBefore,
  maturityKeys,
  type CurveMoveClassification
} from "@/domain/treasury/research";
import type { HistoricalRow } from "@/domain/treasury/types";
import { formatBps, formatDate, formatYield } from "@/utils/format";

interface YieldCurveComparisonProps {
  rows: HistoricalRow[];
  asOfDate: string;
  referenceDate: string;
  secondReferenceDate: string;
  onAsOfDateChange: (value: string) => void;
  onReferenceDateChange: (value: string) => void;
  onSecondReferenceDateChange: (value: string) => void;
}

type ComparisonSeriesKey = "asOf" | "reference" | "reference2";

const seriesColors: Record<ComparisonSeriesKey, string> = {
  asOf: "var(--comparison-current)",
  reference: "var(--comparison-reference)",
  reference2: "var(--comparison-secondary)"
};

const regimeColors: Record<CurveMoveClassification, string> = {
  "Bull steepening": "var(--regime-bull-steepening)",
  "Bear steepening": "var(--regime-bear-steepening)",
  "Bull flattening": "var(--regime-bull-flattening)",
  "Bear flattening": "var(--regime-bear-flattening)",
  "Parallel shift higher": "var(--regime-parallel-higher)",
  "Parallel shift lower": "var(--regime-parallel-lower)",
  "Neutral / unclassified": "var(--chart-regime-neutral)"
};

// Date-to-date comparisons reuse the project's tightest disclosed slope
// tolerance so a trivial slope move is not labelled a steepener/flattener.
const comparisonToleranceBps = curveMoveShapeToleranceBps["1W"];

// Adjacent-tenor chart bands; the three non-adjacent segments stay in the
// classification cards below the chart.
const adjacentSegments = [
  { x1: "2Y", x2: "5Y", pairKey: "5Y2Y" },
  { x1: "5Y", x2: "10Y", pairKey: "10Y5Y" },
  { x1: "10Y", x2: "30Y", pairKey: "30Y10Y" }
] as const;

interface ComparisonTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey?: string; name?: string; value?: number; color?: string }>;
}

function ComparisonTooltip({ active, label, payload }: ComparisonTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip chart-tooltip--wide">
      <span className="chart-tooltip__label">{label}</span>
      <div className="chart-tooltip__rows">
        {payload.map((item) => (
          <div className="chart-tooltip__row" key={item.dataKey}>
            <span>
              <i style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <strong>{typeof item.value === "number" ? formatYield(item.value) : "n/a"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function YieldCurveComparison({
  rows,
  asOfDate,
  referenceDate,
  secondReferenceDate,
  onAsOfDateChange,
  onReferenceDateChange,
  onSecondReferenceDateChange
}: YieldCurveComparisonProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Partial<Record<ComparisonSeriesKey, boolean>>>({});
  const [showMethodology, setShowMethodology] = useState(false);

  const asOfRow = useMemo(
    () => (asOfDate ? findCompleteCurveObservationOnOrBefore(rows, asOfDate) : null),
    [asOfDate, rows]
  );
  const referenceRow = useMemo(
    () => (referenceDate ? findCompleteCurveObservationOnOrBefore(rows, referenceDate) : null),
    [referenceDate, rows]
  );
  const secondReferenceRow = useMemo(
    () => (secondReferenceDate ? findCompleteCurveObservationOnOrBefore(rows, secondReferenceDate) : null),
    [rows, secondReferenceDate]
  );

  const canCompare = Boolean(asOfRow && referenceRow && referenceRow.date < asOfRow.date);
  const hasSecondReference = Boolean(
    canCompare && secondReferenceRow && asOfRow && secondReferenceRow.date < asOfRow.date
  );

  const comparisonData = useMemo(() => {
    if (!asOfRow || !referenceRow) return [];

    return maturityKeys.map((key) => ({
      maturity: key,
      asOf: asOfRow[key] as number,
      reference: referenceRow[key] as number,
      changeBps: ((asOfRow[key] as number) - (referenceRow[key] as number)) * 100,
      ...(hasSecondReference && secondReferenceRow
        ? {
            reference2: secondReferenceRow[key] as number,
            changeBps2: ((asOfRow[key] as number) - (secondReferenceRow[key] as number)) * 100
          }
        : {})
    }));
  }, [asOfRow, hasSecondReference, referenceRow, secondReferenceRow]);

  const toggleSeries = (key: ComparisonSeriesKey) =>
    setHiddenSeries((current) => ({ ...current, [key]: !current[key] }));

  // Zoom the Y axis to the curves that are actually visible so nearly
  // overlapping curves stay distinguishable; hiding a curve rescales the axis.
  const yDomain = useMemo<[number, number] | null>(() => {
    const values: number[] = [];
    comparisonData.forEach((point) => {
      if (!hiddenSeries.asOf) values.push(point.asOf);
      if (!hiddenSeries.reference) values.push(point.reference);
      if (hasSecondReference && !hiddenSeries.reference2 && typeof point.reference2 === "number") {
        values.push(point.reference2);
      }
    });
    if (!values.length) return null;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = Math.max((maximum - minimum) * 0.12, 0.04);
    return [minimum - padding, maximum + padding];
  }, [comparisonData, hasSecondReference, hiddenSeries]);
  const yTickDecimals = yDomain && yDomain[1] - yDomain[0] < 0.6 ? 2 : 1;

  const moveBlocks = useMemo(() => {
    if (!asOfRow) return [];

    const buildBlock = (reference: HistoricalRow) => ({
      referenceDate: reference.date,
      moves: curvePairs.map((pair) => ({
        pair,
        move: buildCurveMove(reference, asOfRow, pair, comparisonToleranceBps)
      }))
    });

    return [
      ...(canCompare && referenceRow ? [buildBlock(referenceRow)] : []),
      ...(hasSecondReference && secondReferenceRow ? [buildBlock(secondReferenceRow)] : [])
    ];
  }, [asOfRow, canCompare, hasSecondReference, referenceRow, secondReferenceRow]);

  const legendItems: Array<{ key: ComparisonSeriesKey; label: string }> = [
    { key: "reference", label: formatDate(referenceRow?.date) },
    ...(hasSecondReference ? [{ key: "reference2" as const, label: formatDate(secondReferenceRow?.date) }] : []),
    { key: "asOf", label: formatDate(asOfRow?.date) }
  ];

  return (
    <article className="panel curve-comparison-panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Yield curve comparison</p>
          <h3>Compare Up To Three Historical Curves</h3>
        </div>
        <span className="panel__meta">Nearest prior official business-day observation is used</span>
      </div>

      <div className="comparison-controls">
        <CalendarRange size={16} aria-hidden="true" />
        <label>
          <span>As of</span>
          <input type="date" value={asOfDate} min={rows[0]?.date} max={rows.at(-1)?.date} onChange={(event) => onAsOfDateChange(event.target.value)} onInput={(event) => onAsOfDateChange(event.currentTarget.value)} />
        </label>
        <label>
          <span>Reference</span>
          <input
            type="date"
            value={referenceDate}
            min={rows[0]?.date}
            max={asOfDate || rows.at(-1)?.date}
            onChange={(event) => onReferenceDateChange(event.target.value)}
            onInput={(event) => onReferenceDateChange(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Reference 2 · optional</span>
          <input
            type="date"
            value={secondReferenceDate}
            min={rows[0]?.date}
            max={asOfDate || rows.at(-1)?.date}
            onChange={(event) => onSecondReferenceDateChange(event.target.value)}
            onInput={(event) => onSecondReferenceDateChange(event.currentTarget.value)}
          />
        </label>
        {secondReferenceDate ? (
          <button className="text-button" type="button" onClick={() => onSecondReferenceDateChange("")}>
            <X size={14} aria-hidden="true" />
            Clear 2nd
          </button>
        ) : null}
      </div>

      {canCompare ? (
        <>
          <div className="comparison-dates">
            <span>As of observed: <strong>{formatDate(asOfRow?.date)}</strong></span>
            <span>Reference observed: <strong>{formatDate(referenceRow?.date)}</strong></span>
            {hasSecondReference ? <span>Reference 2 observed: <strong>{formatDate(secondReferenceRow?.date)}</strong></span> : null}
          </div>
          <div className="comparison-legend" role="group" aria-label="Toggle curve visibility">
            {legendItems.map((item) => {
              const isHidden = Boolean(hiddenSeries[item.key]);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={isHidden ? "comparison-legend__item comparison-legend__item--hidden" : "comparison-legend__item"}
                  aria-pressed={!isHidden}
                  title={isHidden ? `Show the ${item.label} curve` : `Hide the ${item.label} curve`}
                  onClick={() => toggleSeries(item.key)}
                >
                  <i style={{ backgroundColor: seriesColors[item.key] }} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
            <span className="comparison-legend__hint">
              Click a legend entry to show or hide that curve.
              {moveBlocks[0] ? ` Shaded bands classify each adjacent segment vs ${formatDate(moveBlocks[0].referenceDate)}.` : ""}
            </span>
          </div>
          <div className="comparison-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData} margin={{ top: 12, right: 18, bottom: 4, left: -8 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
                <XAxis dataKey="maturity" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  domain={yDomain ?? ["dataMin - 0.2", "dataMax + 0.2"]}
                  tickFormatter={(value) => `${Number(value).toFixed(yTickDecimals)}%`}
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                />
                <Tooltip content={<ComparisonTooltip />} cursor={{ stroke: "var(--chart-crosshair)", strokeWidth: 1, strokeDasharray: "3 4" }} />
                {moveBlocks[0]
                  ? adjacentSegments.map((segment) => {
                      const move = moveBlocks[0].moves.find((entry) => entry.pair.key === segment.pairKey)?.move;
                      if (!move) return null;
                      return (
                        <ReferenceArea
                          key={segment.pairKey}
                          x1={segment.x1}
                          x2={segment.x2}
                          fill={regimeColors[move.type]}
                          fillOpacity={0.055}
                          stroke={regimeColors[move.type]}
                          strokeOpacity={0.3}
                          strokeDasharray="3 5"
                          ifOverflow="hidden"
                          label={{
                            value: move.type,
                            position: "insideTop",
                            fill: regimeColors[move.type],
                            fontSize: 10.5,
                            fontWeight: 700
                          }}
                        />
                      );
                    })
                  : null}
                <Line
                  type="linear"
                  dataKey="reference"
                  name={formatDate(referenceRow?.date)}
                  hide={Boolean(hiddenSeries.reference)}
                  stroke={seriesColors.reference}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3, strokeWidth: 1, fill: seriesColors.reference }}
                  isAnimationActive={false}
                />
                {hasSecondReference ? (
                  <Line
                    type="linear"
                    dataKey="reference2"
                    name={formatDate(secondReferenceRow?.date)}
                    hide={Boolean(hiddenSeries.reference2)}
                    stroke={seriesColors.reference2}
                    strokeWidth={2}
                    strokeDasharray="2 4"
                    dot={{ r: 3, strokeWidth: 1, fill: seriesColors.reference2 }}
                    isAnimationActive={false}
                  />
                ) : null}
                <Line
                  type="linear"
                  dataKey="asOf"
                  name={formatDate(asOfRow?.date)}
                  hide={Boolean(hiddenSeries.asOf)}
                  stroke={seriesColors.asOf}
                  strokeWidth={2.6}
                  dot={{ r: 3.5, strokeWidth: 1, fill: seriesColors.asOf }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="comparison-delta-grid" aria-label="Yield changes by maturity">
            {comparisonData.map((point) => (
              <div key={point.maturity} className={hasSecondReference ? "comparison-delta comparison-delta--stacked" : "comparison-delta"}>
                <span>{point.maturity}</span>
                <div className="comparison-delta__values">
                  <div>
                    <strong>{formatBps(point.changeBps)}</strong>
                    {hasSecondReference ? <small>vs {formatDate(referenceRow?.date)}</small> : null}
                  </div>
                  {hasSecondReference ? (
                    <div>
                      <strong className="comparison-delta__secondary">{formatBps(point.changeBps2)}</strong>
                      <small>vs {formatDate(secondReferenceRow?.date)}</small>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {moveBlocks.length ? (
            <div className="comparison-regimes">
              <div className="comparison-regimes__header">
                <strong>Curve move classification</strong>
                <span>
                  Six two-tenor segments · near-parallel within a ±{comparisonToleranceBps} bps slope change ·
                  ex-post description of the selected dates, not a signal
                </span>
                <button
                  type="button"
                  className="comparison-method-toggle"
                  aria-expanded={showMethodology}
                  onClick={() => setShowMethodology((current) => !current)}
                >
                  <HelpCircle size={14} aria-hidden="true" />
                  How is this calculated?
                  {showMethodology ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                </button>
              </div>
              {showMethodology ? (
                <div className="comparison-method">
                  <ol className="comparison-method__steps">
                    <li>
                      <strong>Measure each tenor&apos;s move.</strong> For a segment such as 10Y - 2Y, take how much each
                      of the two yields changed between the reference date and the as-of date, in basis points
                      (1 bp = 0.01 percentage point).
                    </li>
                    <li>
                      <strong>Slope change.</strong> Long-tenor move minus short-tenor move. A positive value means the
                      gap widened (curve steepened); a negative value means it narrowed (curve flattened).
                    </li>
                    <li>
                      <strong>Pair average move.</strong> The average of the two moves. Positive = yields rose overall
                      (<em>bear</em>, since bond prices fell); negative = yields fell overall (<em>bull</em>).
                    </li>
                    <li>
                      <strong>Combine them.</strong> If the slope change stays within ±{comparisonToleranceBps} bps the move
                      counts as near-parallel; otherwise the slope direction picks steepening or flattening, and the pair
                      average picks bull or bear.
                    </li>
                  </ol>
                  <div className="comparison-method__rules" aria-label="Classification outcomes">
                    <span style={{ "--regime-color": regimeColors["Bull steepening"] } as CSSProperties}>Slope &gt; +{comparisonToleranceBps} bps · avg &lt; 0 → <strong>Bull steepening</strong></span>
                    <span style={{ "--regime-color": regimeColors["Bear steepening"] } as CSSProperties}>Slope &gt; +{comparisonToleranceBps} bps · avg &gt; 0 → <strong>Bear steepening</strong></span>
                    <span style={{ "--regime-color": regimeColors["Bull flattening"] } as CSSProperties}>Slope &lt; -{comparisonToleranceBps} bps · avg &lt; 0 → <strong>Bull flattening</strong></span>
                    <span style={{ "--regime-color": regimeColors["Bear flattening"] } as CSSProperties}>Slope &lt; -{comparisonToleranceBps} bps · avg &gt; 0 → <strong>Bear flattening</strong></span>
                    <span style={{ "--regime-color": regimeColors["Parallel shift lower"] } as CSSProperties}>|Slope| ≤ {comparisonToleranceBps} bps · avg &lt; 0 → <strong>Parallel shift lower</strong></span>
                    <span style={{ "--regime-color": regimeColors["Parallel shift higher"] } as CSSProperties}>|Slope| ≤ {comparisonToleranceBps} bps · avg &gt; 0 → <strong>Parallel shift higher</strong></span>
                  </div>
                  {(() => {
                    const example = moveBlocks[0]?.moves.find((entry) => entry.move)?.pair;
                    const exampleMove = moveBlocks[0]?.moves.find((entry) => entry.move)?.move;
                    if (!example || !exampleMove) return null;
                    return (
                      <p className="comparison-method__example">
                        <strong>Worked example from your selection ({example.label}):</strong>{" "}
                        {example.shortKey} moved {formatBps(exampleMove.shortDeltaBps)} and {example.longKey} moved{" "}
                        {formatBps(exampleMove.longDeltaBps)} between {formatDate(moveBlocks[0].referenceDate)} and{" "}
                        {formatDate(asOfRow?.date)}. Slope change = {formatBps(exampleMove.longDeltaBps)} − ({formatBps(exampleMove.shortDeltaBps)}) ={" "}
                        {formatBps(exampleMove.spreadDeltaBps)}; pair average = ({formatBps(exampleMove.longDeltaBps)} + {formatBps(exampleMove.shortDeltaBps)}) / 2 ={" "}
                        {formatBps(exampleMove.levelDeltaBps)}. That combination is classified as{" "}
                        <strong style={{ color: regimeColors[exampleMove.type] }}>{exampleMove.type}</strong>.
                      </p>
                    );
                  })()}
                  <p className="comparison-method__note">
                    An exactly zero pair average is neutral and left unclassified. These labels describe what happened
                    between the two selected observations; they are not forecasts or trading signals.
                  </p>
                </div>
              ) : null}
              {moveBlocks.map((block) => (
                <div className="comparison-regimes__block" key={block.referenceDate}>
                  <span className="comparison-regimes__ref">
                    {formatDate(block.referenceDate)} → {formatDate(asOfRow?.date)}
                  </span>
                  <div className="comparison-regimes__grid">
                    {block.moves.map(({ pair, move }) => (
                      <div
                        className="comparison-regimes__item"
                        key={pair.key}
                        style={{ "--regime-color": move ? regimeColors[move.type] : "var(--chart-regime-neutral)" } as CSSProperties}
                      >
                        <span>{pair.label}</span>
                        <strong>{move ? move.type : "n/a"}</strong>
                        <small>
                          {move
                            ? `Slope ${formatBps(move.spreadDeltaBps)} · pair avg ${formatBps(move.levelDeltaBps)}`
                            : "Insufficient observations"}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="comparison-empty">
          <Info size={16} aria-hidden="true" />
          <span>
            Select two dates with complete 2Y, 5Y, 10Y, and 30Y observations. The 30Y series is intentionally unavailable during its 2002-06 discontinuation period.
          </span>
        </div>
      )}
    </article>
  );
}
