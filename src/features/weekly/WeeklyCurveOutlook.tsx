import { useMemo, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleGauge, Database, Info, ShieldCheck } from "lucide-react";
import {
  curvePairs,
  maturityKeys,
  type CurveMove,
  type CurveMoveClassification,
  type CurvePair
} from "@/domain/treasury/research";
import {
  DAILY_REGIME_TOLERANCE_BPS,
  WEEKLY_REGIME_TOLERANCE_BPS,
  YEAR_END_REGIME_TOLERANCE_BPS,
  buildWeeklyCurveResearch
} from "@/domain/treasury/weeklyOutlook";
import {
  DNS_DECAY_PER_MONTH,
  YEAR_END_BACKTEST_ORIGINS,
  YEAR_END_TRAINING_MONTHS,
  buildYearEndForecast
} from "@/domain/treasury/yearEndForecast";
import type { HistoricalRow, ResearchMaturityKey, SpreadKey } from "@/domain/treasury/types";
import { formatBps, formatDate, formatYield } from "@/utils/format";

const regimeColors: Record<CurveMoveClassification, string> = {
  "Bull steepening": "var(--regime-bull-steepening)",
  "Bear steepening": "var(--regime-bear-steepening)",
  "Bull flattening": "var(--regime-bull-flattening)",
  "Bear flattening": "var(--regime-bear-flattening)",
  "Parallel shift higher": "var(--regime-parallel-higher)",
  "Parallel shift lower": "var(--regime-parallel-lower)",
  "Neutral / unclassified": "var(--chart-regime-neutral)"
};

const regimeStyle = (type: CurveMoveClassification) => ({
  "--weekly-regime-color": regimeColors[type]
}) as CSSProperties;

const formatNullableBps = (value: number | null | undefined) =>
  typeof value === "number" ? formatBps(value) : "—";

const RegimeTag = ({ type }: { type: CurveMoveClassification }) => (
  <span className="weekly-regime" style={regimeStyle(type)}><i aria-hidden="true" />{type}</span>
);

const MoveSummary = ({ move }: { move: CurveMove | null }) => (
  move ? (
    <>
      <RegimeTag type={move.type} />
      <span className="weekly-summary__numbers">
        Pair avg. {formatBps(move.levelDeltaBps)} · slope {formatBps(move.spreadDeltaBps)}
      </span>
    </>
  ) : <span className="weekly-summary__empty">Insufficient official observations</span>
);

const metric = (value: number | null, suffix = " bps") =>
  typeof value === "number" ? `${value.toFixed(1)}${suffix}` : "n/a";

const shiftWeek = (weekStart: string, days: number) => {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

interface WeeklyCurveOutlookProps {
  rows: HistoricalRow[];
  pair: CurvePair;
  selectedWeekStart: string;
  onPairChange: (key: SpreadKey) => void;
  onWeekStartChange: (weekStart: string) => void;
}

export function WeeklyCurveOutlook({ rows, pair, selectedWeekStart, onPairChange, onWeekStartChange }: WeeklyCurveOutlookProps) {
  const yearEndModel = useMemo(() => buildYearEndForecast(rows), [rows]);
  const research = useMemo(
    () => buildWeeklyCurveResearch(rows, pair, selectedWeekStart, yearEndModel),
    [pair, rows, selectedWeekStart, yearEndModel]
  );

  if (!research) {
    return <div className="empty-state">A complete 2Y, 5Y, 10Y, and 30Y official curve history is required for weekly analysis.</div>;
  }

  const { yearEndForecast, yearEndMove } = research;
  const selectedAsOf = research.asOf;
  const diagnostics = yearEndForecast?.diagnostics;
  const isLatestWeek = research.weekStart === research.latestWeekStart;
  const selectWeek = (weekStart: string) => {
    onWeekStartChange(weekStart === research.latestWeekStart ? "" : weekStart);
  };

  return (
    <article className="panel weekly-desk">
      <div className="weekly-desk__toolbar">
        <div>
          <p className="eyebrow">Official weekly record</p>
          <h3>{pair.longLabel} curve monitor</h3>
          <p>Published Treasury CMT observations only. Missing and unpublished dates remain blank rather than being estimated.</p>
        </div>
        <div className="weekly-desk__asof">
          <span>Selected week-end observation</span>
          <strong>{research.asOf ? formatDate(research.asOf.date) : `No ${pair.label} observation`}</strong>
        </div>
      </div>

      <div className="weekly-week-control" role="group" aria-label="Historical week selection">
        <div className="weekly-week-control__field">
          <label htmlFor="weekly-week-start">Week starting Monday</label>
          <div className="weekly-week-control__actions">
            <button
              className="weekly-week-control__nav"
              type="button"
              aria-label="Show previous week"
              title="Previous week"
              disabled={research.weekStart <= research.earliestWeekStart}
              onClick={() => selectWeek(shiftWeek(research.weekStart, -7))}
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <input
              id="weekly-week-start"
              type="date"
              step={7}
              min={research.earliestWeekStart}
              max={research.latestWeekStart}
              value={research.weekStart}
              onInput={(event) => event.currentTarget.value && selectWeek(event.currentTarget.value)}
            />
            <button
              className="weekly-week-control__nav"
              type="button"
              aria-label="Show next week"
              title="Next week"
              disabled={isLatestWeek}
              onClick={() => selectWeek(shiftWeek(research.weekStart, 7))}
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
            <button
              className="weekly-week-control__latest"
              type="button"
              disabled={isLatestWeek}
              onClick={() => onWeekStartChange("")}
            >
              Latest week
            </button>
          </div>
        </div>
        <span className="weekly-week-control__context">
          {isLatestWeek
            ? `Latest available week · source through ${formatDate(research.latestAvailableDate)}`
            : `Historical as-of view · later observations excluded`}
        </span>
      </div>

      <div className="weekly-pair-control">
        <span>Curve segment</span>
        <div className="spread-selector" aria-label="Weekly curve segment">
          {curvePairs.map((item) => (
            <button
              className={pair.key === item.key ? "spread-selector__button spread-selector__button--active" : "spread-selector__button"}
              type="button"
              key={item.key}
              aria-pressed={pair.key === item.key}
              onClick={() => onPairChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section className="weekly-summary-grid" aria-label="Observed curve movement summary">
        <div className="weekly-summary">
          <span>Selected week · actual change</span>
          <strong>{research.asOf
            ? research.weeklyComparisonDate
              ? `${formatDate(research.weeklyComparisonDate)} → ${formatDate(research.asOf.date)}`
              : formatDate(research.asOf.date)
            : `No ${pair.label} observation`}</strong>
          <MoveSummary move={research.weeklyMove} />
        </div>
        <div className="weekly-summary">
          <span>Selected week-end {pair.label} spread</span>
          <strong>{typeof research.currentSpreadBps === "number" ? `${research.currentSpreadBps.toFixed(1)} bps` : "n/a"}</strong>
          {research.asOf ? (
            <span className="weekly-summary__numbers">
              {pair.shortKey} {formatYield(Number(research.asOf[pair.shortKey]))} · {pair.longKey} {formatYield(Number(research.asOf[pair.longKey]))}
            </span>
          ) : <span className="weekly-summary__empty">No pair observation in this week</span>}
        </div>
        <div className="weekly-summary">
          <span>Year to selected date · actual change</span>
          <strong>{research.asOf
            ? research.yearToDateStart
              ? `${formatDate(research.yearToDateStart)} → ${formatDate(research.asOf.date)}`
              : formatDate(research.asOf.date)
            : "No selected as-of observation"}</strong>
          <MoveSummary move={research.yearToDateMove} />
        </div>
      </section>

      <div className="weekly-table-heading">
        <div>
          <CalendarDays size={16} aria-hidden="true" />
          <strong>Week of {formatDate(research.weekStart)}</strong>
        </div>
        <span>Official source records through {formatDate(research.latestAvailableDate)} · no forward-filled values</span>
      </div>

      <div className="weekly-table-wrap">
        <table className="weekly-table">
          <thead>
            <tr>
              <th>Day / date</th>
              <th>Record status</th>
              {maturityKeys.map((key) => <th key={key}>{key}</th>)}
              <th>{pair.label} spread</th>
              <th>Pair avg. Δ</th>
              <th>Slope Δ</th>
              <th>Daily regime</th>
            </tr>
          </thead>
          <tbody>
            {research.tableRows.map((row) => {
              const statusClass = row.status.toLowerCase().replaceAll(" ", "-");
              return (
                <tr key={row.date} className={row.status === "Official CMT" ? undefined : "weekly-table__unavailable"}>
                  <th>
                    <strong>{row.day}</strong>
                    <span>{formatDate(row.date)}</span>
                  </th>
                  <td><span className={`weekly-status weekly-status--${statusClass}`}>{row.status}</span></td>
                  {maturityKeys.map((key) => (
                    <td key={key}><strong>{typeof row.yields[key] === "number" ? formatYield(row.yields[key]) : "—"}</strong></td>
                  ))}
                  <td><strong>{typeof row.spreadBps === "number" ? `${row.spreadBps.toFixed(1)} bps` : "—"}</strong></td>
                  <td>{formatNullableBps(row.levelDeltaBps)}</td>
                  <td>{formatNullableBps(row.spreadDeltaBps)}</td>
                  <td>
                    {row.regime ? <RegimeTag type={row.regime} /> : <span className="weekly-table__empty">—</span>}
                    {row.comparisonDate ? <small>vs {formatDate(row.comparisonDate)}</small> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="weekly-observation-note">
        <Database size={15} aria-hidden="true" />
        <p>
          Every populated yield is an official daily Treasury CMT par yield. Daily changes compare each row with the immediately preceding available official observation, so Mondays normally compare with Friday and holidays are not treated as zero-change days.
        </p>
      </div>

      <section className="year-end-outlook" aria-label="Year-end statistical yield outlook">
        <div className="year-end-outlook__header">
          <div>
            <p className="eyebrow">Modeled scenario{research.asOf ? ` · as of ${formatDate(research.asOf.date)}` : ""} · separate from official data</p>
            <h3>Year-end statistical baseline · {yearEndForecast ? formatDate(yearEndForecast.targetDate) : "unavailable"}</h3>
          </div>
          {yearEndForecast ? <span className="forecast-confidence">DNS + random walk</span> : null}
        </div>

        {yearEndForecast && yearEndMove && selectedAsOf ? (
          <>
            <div className="year-end-yields">
              {maturityKeys.map((key: ResearchMaturityKey) => (
                <div key={key}>
                  <span>{key} CMT model median</span>
                  <strong>{formatYield(yearEndForecast.yields[key].median)}</strong>
                  <small>Empirical 20–80 band: {formatYield(yearEndForecast.yields[key].low)}–{formatYield(yearEndForecast.yields[key].high)}</small>
                  <em>Selected as-of actual: {formatYield(Number(selectedAsOf[key]))}</em>
                </div>
              ))}
            </div>
            <div className="year-end-read">
              <div>
                <span>Implied {pair.label} regime</span>
                <RegimeTag type={yearEndMove.type} />
              </div>
              <div>
                <span>Modeled pair-average move</span>
                <strong>{formatBps(yearEndMove.levelDeltaBps)}</strong>
              </div>
              <div>
                <span>Modeled slope change</span>
                <strong>{formatBps(yearEndMove.spreadDeltaBps)}</strong>
              </div>
              <div>
                <span>Validated model blend</span>
                <strong>{diagnostics?.dnsWeightPct ?? 50}% DNS · {diagnostics?.randomWalkWeightPct ?? 50}% RW</strong>
              </div>
            </div>
            <p className="year-end-rationale">{research.yearEndRationale}</p>

            <section className="forecast-audit" aria-label="Year-end model validation">
              <div className="forecast-audit__item">
                <CircleGauge size={16} aria-hidden="true" />
                <div><span>Rolling-origin evaluation</span><strong>{diagnostics?.backtestOrigins ?? 0} historical origins · same {yearEndForecast.horizonMonths}-month horizon</strong></div>
              </div>
              <div className="forecast-audit__item">
                <ShieldCheck size={16} aria-hidden="true" />
                <div><span>Out-of-sample MAE</span><strong>Ensemble {metric(diagnostics?.ensembleMaeBps ?? null)} · DNS {metric(diagnostics?.dnsMaeBps ?? null)} · RW {metric(diagnostics?.randomWalkMaeBps ?? null)}</strong></div>
              </div>
              <div className="forecast-audit__item">
                <Info size={16} aria-hidden="true" />
                <div><span>Empirical 20–80 band check</span><strong>{diagnostics?.empiricalBandCoveragePct ?? "n/a"}% coverage across {diagnostics?.coverageObservations ?? 0} forward observations</strong></div>
              </div>
            </section>

            <details className="year-end-methodology">
              <summary>Year-end forecast methodology, validation, and limitations</summary>
              <div>
                <p><strong>Curve model.</strong> The model uses Dynamic Nelson-Siegel as a descriptive factor approximation to the four 2Y, 5Y, 10Y, and 30Y CMT par-rate points. It uses the standard fixed monthly decay parameter λ = {DNS_DECAY_PER_MONTH} and independently estimated AR(1) factor dynamics; it is not a fitted zero-coupon or no-arbitrage curve.</p>
                <p><strong>Benchmark and combination.</strong> The DNS forecast is combined with a no-change random-walk benchmark. Weights are inverse-MAE weights learned only from prior rolling-origin errors and bounded between 20% and 80%. The final displayed weight uses up to {YEAR_END_BACKTEST_ORIGINS} recent historical origins.</p>
                <p><strong>Training and intervals.</strong> Factor dynamics use up to {YEAR_END_TRAINING_MONTHS} completed month-end curves ({formatDate(yearEndForecast.trainingStartDate)}–{formatDate(yearEndForecast.trainingEndDate)}). Displayed bands are the 20th and 80th percentiles of prior rolling ensemble residuals; they are not guaranteed confidence intervals.</p>
                <p><strong>Historical as-of discipline.</strong> Selecting an earlier week truncates all model inputs at that week&apos;s final available {pair.label} observation. Later yields, model errors, and regime outcomes are excluded to prevent look-ahead bias.</p>
                <p><strong>Scope.</strong> This is a yield-only statistical baseline, not a trade recommendation or a discretionary macro forecast. It does not include OIS/SOFR forwards, inflation swaps, survey expectations, Treasury supply, term-premium estimates, positioning, or event scenarios. A professional investment process should challenge the baseline with those inputs.</p>
                <p className="year-end-methodology__sources">
                  Research basis: <a href="https://www.nber.org/papers/w10048" target="_blank" rel="noreferrer">Diebold–Li Dynamic Nelson-Siegel</a> · <a href="https://www.federalreserve.gov/pubs/ifdp/2010/993/ifdp993.htm" target="_blank" rel="noreferrer">Federal Reserve yield-forecast combination evidence</a> · <a href="https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/treasury-yield-curve-methodology" target="_blank" rel="noreferrer">Treasury CMT methodology</a>
                </p>
              </div>
            </details>
          </>
        ) : (
          <div className="empty-state">No year-end baseline is available for this selected week. A complete four-tenor as-of curve and sufficient pre-as-of monthly history are required.</div>
        )}
      </section>

      <div className="weekly-methodology-note">
        <Info size={15} aria-hidden="true" />
        <p>
          <strong>Regime rules.</strong> Pair-average change determines bull versus bear; long-minus-short spread change determines steepening versus flattening. Near-parallel tolerances are {DAILY_REGIME_TOLERANCE_BPS} bp for daily observations, {WEEKLY_REGIME_TOLERANCE_BPS} bps for the weekly summary, and {YEAR_END_REGIME_TOLERANCE_BPS} bps for year-to-date and year-end comparisons. These are disclosed project rules, not official Treasury classifications.
        </p>
      </div>
    </article>
  );
}
