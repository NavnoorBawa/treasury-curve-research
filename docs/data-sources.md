# Data Source Decision

## Decision

Use a two-source architecture:

1. Official U.S. Department of the Treasury Daily Treasury Interest Rate XML feed for current/latest values.
2. Official Federal Reserve H.15 Data Download Program Treasury Constant Maturities package for long-run daily historical analysis.

FRED is credible and professor-friendly as a reference, but it is not the best primary production feed here because it republishes Treasury constant maturity data through the Federal Reserve/FRED ecosystem and can lag the Treasury feed. The Treasury XML feed is the direct publisher for the Daily Treasury Par Yield Curve Rates used in the top current-market dashboard. The Federal Reserve H.15 DDP is the best free official source for long-run historical research because it provides a direct automated CSV package with all Treasury constant maturity observations.

Yahoo/yfinance is deliberately excluded from the official CMT dataset. It is not an official publisher of U.S. Treasury constant-maturity yields. It is used only in the separate Futures tab as a delayed price feed for exchange-traded CBOT contracts, where instrument identity, trade date, freshness, and limitations are explicit.

## Intraday Source Review

The public dashboard intentionally omits intraday CMT yields because no reviewed free source meets the required combination of accurate 2Y, 5Y, 10Y, and 30Y cash Treasury coverage, documented methodology, automated access, and public redistribution rights. It now includes a separate delayed Treasury-futures reference because those are identifiable traded contracts rather than estimated CMT observations.

- Treasury XML, Federal Reserve H.15/FRED, and Alpha Vantage's Treasury endpoint publish daily or lower-frequency CMT observations, not intraday cash-market quotes: https://home.treasury.gov/treasury-daily-interest-rate-xml-feed and https://www.alphavantage.co/documentation/
- CME BrokerTec is the technically correct continuous source for on-the-run cash Treasuries, but access requires authorized credentials and CME market-data licensing: https://www.cmegroup.com/market-data/browse-data/catalog/brokertec-us-treasuries-on-the-run.html and https://www.cmegroup.com/market-data/license-data.html
- BrokerTec's transaction-based benchmark yields are calculated four times daily, but the official methodology states that distribution is subject to a CME Information License Agreement: https://www.cmegroup.com/market-data/files/benchmark-administration-brokertec-methodology.pdf
- FINRA Treasury aggregates describe prior-trading-day activity and do not provide a real-time tenor yield curve: https://www.finra.org/treasuryaggregates
- Twelve Data lists U.S. Treasury yield symbols, but its free plan is for internal non-display use and its terms require explicit external-display or redistribution rights: https://twelvedata.com/pricing-business and https://twelvedata.com/terms
- TradingView widgets do not provide an API or export path, and the TVC government-bond symbols are restricted from the embedded Advanced Chart widget. A user subscription also does not grant data rights for an independently calculated public dashboard: https://www.tradingview.com/widget-docs/faq/data/ and https://www.tradingview.com/support/solutions/43000709178-what-does-tvc-stand-for-in-the-instrument-ticker/
- Yahoo Finance exposes delayed Treasury-futures prices for `ZT=F`, `ZF=F`, `ZN=F`, and `UB=F`. Ultra Bond's 25Y+ deliverable basket is the defensible long-end proxy; classic `ZB=F` is not labeled 30Y because its deliverable basket is 15 to under 25 years. Yahoo/yfinance remains unofficial and rate-limited. The implementation therefore labels it delayed, validates each contract's session independently, caches for five minutes, supports explicit fallbacks, and never mixes it into official calculations.

Treating an embedded third-party chart, Treasury-futures proxy, or delayed retail symbol as the official CMT curve would weaken the project's data lineage. The Futures tab avoids that error by presenting only traded contract prices and explicitly disclosing the inverse directional relationship, cheapest-to-deliver basis, delay, and non-comparability of raw moves across tenors. If redistribution-authorized BrokerTec or equivalent cash-market data is obtained later, it should be added as a separate on-the-run instrument layer and never spliced into the daily CMT history.

## Sources Compared

### 1. U.S. Treasury Daily Treasury Interest Rate XML Feed

Primary source for Daily Treasury Par Yield Curve Rates.

- Official XML feed documentation: https://home.treasury.gov/treasury-daily-interest-rate-xml-feed
- Official data page: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve
- Data key used by this app: `daily_treasury_yield_curve`
- Maturities available include 1M, 1.5M, 2M, 3M, 4M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, and 30Y.
- No API key required.
- Free, official, and directly maintained by Treasury.

Treasury states that these CMT par yields are derived from indicative bid-side quotations obtained by the Federal Reserve Bank of New York at or near 3:30 PM each trading day and are usually published by 6:00 PM Eastern Time. Therefore, the official CMT curve is intrinsically daily. A free source that appears to update intraday would be showing a different instrument, an estimate, or a republished value rather than a newer official CMT observation.

The Treasury documentation says the feed accepts GET requests, returns XML responses, and supports standard HTTP response codes. Treasury also documents the exact endpoint used by this app:

```text
https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY
```

Treasury moved from the quasi-cubic Hermite method to a monotone-convex curve method on December 6, 2021. Both sets of published CMT rates are official, but the historical workspace exposes this as a methodology marker so a user does not mistake it for a macro regime change.

### 2. FRED / St. Louis Fed

Reliable secondary reference and excellent academic citation source.

- FRED API documentation: https://fred.stlouisfed.org/docs/api/fred/
- FRED API key documentation: https://fred.stlouisfed.org/docs/api/api_key.html
- Relevant series: `DGS2`, `DGS5`, `DGS10`, `DGS30`

FRED identifies the source of these Treasury constant maturity series as the Board of Governors of the Federal Reserve System and the release as H.15 Selected Interest Rates. Its official API requires a registered API key for web service requests. FRED is a strong secondary source, but it is not the original publisher of the Treasury par yield curve.

### 3. Federal Reserve H.15 Selected Interest Rates

Official and reliable, but the Fed notes that nominal Treasury constant maturity yields are interpolated by the U.S. Treasury from the daily yield curve.

- H.15 release: https://www.federalreserve.gov/releases/h15/
- H.15 Data Download Program: https://www.federalreserve.gov/datadownload/Choose.aspx?rel=H15
- Direct Treasury Constant Maturities CSV package: `https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&lastobs=&from=&to=&filetype=csv&label=include&layout=seriescolumn&type=package`

The H.15 release is useful for cross-checking, academic context, and long-run history. For latest daily CMT values, Treasury remains closer to the source. For long-run daily historical analysis, the H.15 DDP package is better than Treasury XML because it extends earlier than Treasury's documented Daily Treasury Par Yield Curve XML availability.

## Freshness Validation

`npm run verify:data` fetches the two official sources at runtime and validates the following on every release check:

- all four current maturity values are numeric;
- daily basis-point changes equal `(latest - prior) * 100`;
- every core spread equals `(long maturity - short maturity) * 100`;
- the H.15 latest historical row is replaced or supplemented by the same latest official Treasury observation when Treasury is newer.

The direct Treasury feed remains the better current-data source because it is both the original official publisher and, when the feeds have not updated simultaneously, the fresher of the two official records.

## Long-Run History Check

The H.15 Treasury Constant Maturities package provides materially longer history than Treasury XML:

- 5Y and 10Y: daily observations from `1962-01-02`.
- 2Y: daily observations from `1976-06-01`.
- 30Y: daily observations from `1977-02-15`, with the known 30Y discontinuation/reintroduction gap preserved as missing values.

This makes H.15 DDP the best official free historical feed for macro-regime analysis, while Treasury XML remains the best latest-current feed.

The dashboard intentionally does not fill the 2002-06 30Y discontinuity using Treasury's 20Y adjustment factor. That could be useful for a separate modelled proxy, but it is not the official 30Y CMT series and would contaminate direct 2Y/5Y/10Y/30Y curve comparisons.

## Recommendation

Keep Treasury XML as the primary current-data source and Federal Reserve H.15 DDP as the primary historical research source.

For a larger production system, FRED should be added as a secondary validation/citation source, not as the primary feed. The dashboard can display a source badge and optionally warn if Treasury, H.15, and FRED diverge after all sources have updated.

## Deployment Decision

Vercel remains the better publishing target for this project. It deploys the React application and Node API routes together, creates preview deployments from branches, and keeps the presentation responsive on any device. Streamlit is effective for a quick Python research prototype, but it would require a separate implementation and gives less control over this product's interaction model, metadata, and institutional dashboard presentation. The production site deploys automatically from `main`; future experiments should use preview branches before merging.

## Event Marker Policy

Event markers are not used as data inputs. They are sourced contextual annotations for visual regime research. Every event declares a source and window convention. Decision dates and single events are distinguished from project-defined composite or market-anchor windows. Descriptions avoid claiming a single-cause relationship between an event and yield movements.
