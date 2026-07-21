# Weekly Record and Year-End Baseline

The Weekly view is a local research extension. It deliberately separates two different data classes:

1. the Monday-Friday table contains only published official Treasury CMT observations; and
2. the year-end section contains a labeled statistical forecast that never enters official history, spreads, regimes, statistics, or CSV exports.

## Scope and Source

- Instruments: 2Y, 5Y, 10Y, and 30Y nominal Constant Maturity Treasury par yields.
- Curve segments: all six pairwise combinations of those four maturities.
- Default segment: 10Y minus 2Y.
- Current observations: U.S. Treasury XML.
- Long-run history: Federal Reserve H.15 Data Download Program, supplemented only when Treasury has a newer official observation.

The CMT curve is a once-daily official par curve, not an executable close or an intraday transaction series. See the [Treasury yield-curve methodology](https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/treasury-yield-curve-methodology).

## Actual Weekly Table

The table defaults to the calendar week containing the latest official observation. Previous/next controls and the Monday date field can select any supported historical week. Non-latest selections are preserved in shareable URLs as `?view=weekly&week=YYYY-MM-DD`:

- `Official CMT` means the cell comes directly from the normalized official history.
- `No official observation` means a past weekday has no official record, normally because of a market holiday or source-level missing value. No value is imputed.
- `Not yet published` means the date is later than the latest official record. Every yield and derived field remains blank.
- Daily changes compare an observed row with the immediately preceding available official observation. A Monday normally compares with Friday; the observation after a holiday skips the blank date.
- The weekly summary compares the selected week's final pair observation with the final available pair observation before that calendar week and discloses both dates.
- A historical selection is a true as-of view: selected-week, year-to-date, and year-end calculations exclude every observation after that week's final available pair observation.
- If the selected pair has no complete observation in a historical week, the table still shows any maturity values published by H.15, while pair summaries and the year-end baseline remain explicitly unavailable.

There is no daily or Friday forecast in this table.

## Curve Decomposition

For short tenor `s` and long tenor `l`:

```text
pair average move = (change(l) + change(s)) / 2
pair slope change = change(l - s) = change(l) - change(s)
```

| Pair-average move | Pair slope change | Classification |
| --- | --- | --- |
| Lower | Steeper | Bull steepening |
| Higher | Steeper | Bear steepening |
| Lower | Flatter | Bull flattening |
| Higher | Flatter | Bear flattening |
| Lower | Inside near-parallel tolerance | Parallel shift lower |
| Higher | Inside near-parallel tolerance | Parallel shift higher |

An exactly zero pair-average move is neutral and is not forced into a bull or bear label. Near-parallel thresholds are disclosed project rules, not official Treasury definitions: 1 bp for daily observations, 3 bps for the weekly summary, and 10 bps for year-to-date and year-end comparisons.

## Year-End Model

The only projected values in the view are the four year-end yields. The model is a conservative yield-only ensemble, not a claim about a proprietary hedge-fund process.

### Dynamic Nelson-Siegel component

The implementation follows the three-factor Dynamic Nelson-Siegel structure described by [Diebold and Li](https://www.nber.org/papers/w10048):

- level, slope, and curvature factors are fitted by ordinary least squares to each complete 2Y/5Y/10Y/30Y curve;
- the standard fixed monthly decay parameter is `lambda = 0.0609`;
- each factor follows an independently estimated AR(1) process;
- factor dynamics use at most 240 contiguous completed month-end curves and never bridge a missing calendar month as one transition;
- the selected week's final complete official daily curve supplies the forecast origin.

The horizon is the calendar distance from the selected as-of observation to the final weekday of that year, rounded to the nearest whole model month. Using DNS directly as a descriptive approximation to four CMT par-rate points is intentionally parsimonious; it is not equivalent to fitting a full institutional zero-coupon or no-arbitrage curve.

### Random-walk benchmark and combination

Yield-only forecasting models often struggle to outperform a no-change random walk. The dashboard therefore treats the current curve as an explicit benchmark rather than hiding it. This design is consistent with the model-comparison and forecast-combination evidence in the Federal Reserve paper [Term Structure Forecasting Using Macro Factors and Forecast Combination](https://www.federalreserve.gov/pubs/ifdp/2010/993/ifdp993.htm).

The dashboard evaluates the DNS and random-walk forecasts at the same calendar-month horizon as the current year-end target:

1. use up to 84 rolling historical forecast origins;
2. at each origin, estimate DNS dynamics using data available at that origin only;
3. combine DNS and random walk with inverse-MAE weights calculated from earlier rolling errors;
4. constrain each model weight to 20%-80% to avoid unstable winner-take-all selection; and
5. use all completed rolling errors to set the final current-origin weights.

The displayed point is the weighted DNS/random-walk estimate adjusted by the historical median ensemble residual. The lower and upper values add the historical 20th and 80th percentile rolling residuals. These are empirical predictive bands, not guaranteed confidence intervals. The interface reports realized forward coverage alongside DNS, random-walk, and ensemble mean absolute errors.

## Look-Ahead Controls

Every rolling forecast follows this order:

```text
fit through origin t -> estimate weights from errors known before t -> forecast t+h -> score against realized t+h
```

The actual outcome at `t+h` is used only after the forecast is formed. Final as-of-origin model weights use only historical forecasts whose outcomes were already observed at that origin. Selecting an older week truncates the source rows before model fitting, rolling-error estimation, curve classification, and year-to-date calculation; later data never enters the historical result.

## Interpretation and Limitations

The year-end regime label is the mechanical six-regime classification of the modeled median curve versus the latest actual curve. The adjacent text gives possible market-consistent interpretations but makes no single-cause claim.

The baseline does not ingest:

- OIS or SOFR futures;
- inflation swaps or breakevens;
- survey forecasts;
- affine term-premium estimates;
- Treasury issuance and auction supply;
- dealer positioning or flow; or
- discretionary event scenarios.

A professional rates process would use those inputs to challenge and scenario-test the statistical baseline. The output is not an official Treasury or Federal Reserve forecast, an executable price, investment advice, or evidence of tradable alpha.
