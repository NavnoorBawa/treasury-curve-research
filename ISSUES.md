# Launch Audit Issues

Audit scope: all source files, API functions, documentation, and public routes in `treasury-curve-research`, plus the isolated production deployment at `https://treasury-curve-research.vercel.app`.

Status values:

- `OPEN`: confirmed finding that still requires work.
- `RESOLVED`: fixed and verified with the evidence recorded below.
- `ACCEPTED BLOCKER`: cannot be safely resolved without an explicit product or external-service decision.

| ID | Severity | Area | Finding | Action / Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| AUD-001 | Medium | Code quality | `package.json` had no standalone lint command, so the launch requirement to run a linter could not be proven. | Added ESLint 10 with official JavaScript, TypeScript, and stable React Hooks rules; `npm run lint` is part of `npm run verify` and passes with zero warnings. | RESOLVED |
| AUD-002 | Low | Dead code | Futures fallback initialized a value that was always overwritten before use, and H.15 maturity serialization used an intentionally discarded destructured field. | Removed the useless initialization and replaced omission-by-destructuring with an explicit public maturity projection. ESLint and data verification pass. | RESOLVED |
| AUD-003 | Medium | React performance | Futures selection and regime-control reset effects synchronously changed local state after render, causing avoidable follow-up renders. | Derived the futures fallback selection directly and keyed regime state to its pair/horizon/range ownership boundary. Type checking, research tests, and production build pass. | RESOLVED |
| AUD-004 | Low | React correctness | Historical-row memoization referenced `data.rows` through dependencies expressed as `data?.rows`, which React Compiler could not prove stable. | Introduced one `historicalRows` reference and used it consistently in effects and memo dependencies. ESLint and TypeScript pass. | RESOLVED |
| AUD-005 | High | Initial-load performance | The complete Recharts research workspace was in the initial application graph, making every first visit pay for historical chart code. | Lazy-loaded `ResearchWorkbench`, retained a stable loading shell, and removed a circular manual Recharts chunk. The initial application bundle is 62.1 kB gzip; the 144.6 kB gzip research workspace loads only when needed. All audited Lighthouse performance scores are at least 93. | RESOLVED |
| AUD-006 | Medium | Chart performance | Long windows rendered every H.15 point even though a desktop chart cannot display that resolution, increasing SVG work without adding visible information. | Added extrema-preserving display sampling above 420 observations while keeping the complete source rows for calculations, statistics, events, regime classification, and CSV export. Deterministic sampling assertions pass. | RESOLVED |
| AUD-007 | Medium | Accessibility | The regime ribbon exposed many tiny period buttons and redundant accessible naming; several subtle text colors missed the intended contrast standard. | Made the ribbon decorative, added one native completed-period selector, corrected accessible names, and raised subtle-text contrast. Lighthouse accessibility is 100 on every visible route. | RESOLVED |
| AUD-008 | Medium | Mobile usability | Reorder handles, help controls, event chips, and comparison shortcuts were 15-27 px high on a 390 px viewport. | Increased mobile action targets: core controls are 38-40 px, event controls are at least 34 px, and compact icon/help targets are at least 28 px. All visible routes have zero sub-28 px buttons and no document-level horizontal overflow. | RESOLVED |
| AUD-009 | High | Dependency security | Installing the required analytics package exposed a high-severity advisory through an older transitive `shell-quote` version in the development command runner. | Pinned `concurrently` 9.2.0 and updated `shell-quote` to 1.10.0. `npm audit --audit-level=high` reports zero vulnerabilities. | RESOLVED |
| AUD-010 | Medium | Launch observability | The isolated Vercel project had no application analytics integration, so the launch monitoring requirement could not be demonstrated. | Added the official cookieless `@vercel/analytics/react` component and enabled Web Analytics only for `treasury-curve-research`. The same-origin CSP permits its script and view request. | RESOLVED |
| AUD-011 | Medium | Error-state accuracy | When both retries failed and no Treasury payload existed, the header continued to report `Connecting`, which implied an active request indefinitely. | The header now reports `Unavailable`; Treasury and H.15 failures retain separate alerts. A forced dual-503 fixture verified that the shell remains usable and both errors are explicit. | RESOLVED |
| AUD-012 | Low | Empty/input states | A valid zero-row H.15 response displayed `History: n/a - n/a`, and malformed custom-range query parameters required explicit fallback verification. | Empty history now says `History: no official observations`, keeps CSV disabled, and renders a dedicated no-observation message. Invalid dates fall back to the supported 10-year range without an alert or crash. | RESOLVED |
| AUD-013 | Low | Publication metadata | The sitemap modification date was stale and the 404 page linked back using the retired `rates monitor` label. | Updated the canonical sitemap date and the 404 action to `Return to research workspace`; local production returns the page with HTTP 404 and `noindex`. | RESOLVED |
| AUD-014 | High | Upstream resilience | Repeated cold verification exposed intermittent Treasury responses beyond the single 15-second timeout; the history path also fetched H.15 and Treasury sequentially, allowing worst-case latency to exceed the 30-second serverless budget. | Added a bounded 7-second then 15-second Treasury retry with explicit timeout errors, and fetch H.15 plus the Treasury supplement concurrently. Worst-case client wait remains near 22 seconds; API stale-cache fallbacks are unchanged. | RESOLVED |
| AUD-015 | Medium | Production accessibility | Live Market data activated an amber day-over-day spread label whose `#a86c1b` text had a 4.35:1 contrast ratio on white, below the 4.5:1 WCAG AA requirement for normal text. | Added a dedicated light-theme change-text token at `#9f6418` (4.87:1 on white) while retaining the high-contrast dark-theme token. The final production mobile Lighthouse rerun scores 100 accessibility with no contrast or other binary failures. | RESOLVED |

## Verification Log

### Baseline - 2026-07-18

- `npm ci`: passed; 220 packages audited, zero vulnerabilities reported.
- `npm run verify`: passed; production build, six-regime research tests, weekly actual-only and year-end validation tests, deterministic futures tests, and official Treasury/H.15 reconciliation all passed.
- `npm run verify:futures:live`: passed for `ZT=F`, `ZF=F`, `ZN=F`, and `UB=F`.

### Static Quality Gate - 2026-07-18

- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed with zero errors.
- `npm run verify`: passed after the lint and React-state corrections.
- `npm audit --audit-level=high`: zero vulnerabilities.

### Production-Readiness Remediation - 2026-07-21

- Clean `npm ci`: 309 packages installed from `package-lock.json`; zero vulnerabilities.
- Final `npm run verify`: lint, production build, deterministic research/futures suites, and live official Treasury/H.15 reconciliation passed after all remediations.
- Forced 503 fixture: Treasury and H.15 errors remain isolated; the application shell, navigation, and recovery control remain available.
- Valid empty-history fixture: zero-row payload renders the explicit no-observation state and disables CSV without a runtime error.
- Malformed URL fixture: invalid custom dates normalize to the supported default range.
- Responsive route matrix: Market, Weekly, Compare, History charts, History statistics, Events, and Regimes passed at 1440×1000, 768×1024, and 390×844 with no document-level horizontal overflow, alerts, or unresolved loading state.
- Theme matrix: light-default and retained dark preference passed on desktop and mobile.
- Local Lighthouse route matrix: performance 93-99, accessibility 100, best practices 100, and SEO 100 across every visible route.
- Production release sample: Weekly and Regimes scored 98-99 performance and 100 accessibility, best practices, and SEO. After the Market contrast correction, the final production rerun scored 96 performance and 100 accessibility, best practices, and SEO with no failed binary audits.
