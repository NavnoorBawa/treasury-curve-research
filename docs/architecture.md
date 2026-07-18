# Architecture

The repository is organized by runtime boundary first and business feature second. Files should live with the code that owns their behavior, not in a generic catch-all directory.

## Runtime Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Browser application | `src/` | React interface, client-side state, charts, and typed research calculations |
| Vercel API | `api/` | Thin serverless request handlers and response caching |
| Data services | `server/` | Official-source clients, delayed futures client, normalization, and local Express runtime |
| Verification | `scripts/` | Independent source, calculation, regime, and futures checks |
| Static assets | `public/` | Metadata, icons, crawler files, social preview, and 404 page |
| Project documentation | `docs/` | Architecture and data-lineage decisions |

## Frontend Ownership

```text
src/
  app/                  Application composition and global failure handling
  components/ui/        Shared presentation components with no feature ownership
  domain/treasury/      Financial types, constants, and pure analytical functions
  features/
    futures/            Delayed Treasury-futures workspace and query hook
    market/             Current CMT snapshot, curve, and query hook
    regimes/            Six-regime curve-movement analysis
    research/           Historical workspace, comparisons, and history query hook
    weekly/             Actual Monday-Friday curve record and year-end model display
  hooks/                Hooks used across multiple features
  styles/               Global theme and workspace styles
  utils/                Domain-neutral formatting helpers
```

Dependency direction is `app -> features -> domain/shared`. Shared UI and utilities must not import feature modules. Pure Treasury analytics remain in `domain/treasury` so verification scripts can execute them independently of React.

`domain/treasury/weeklyOutlook.ts` reconstructs the actual weekly record and applies the selected-pair regime rules. `domain/treasury/yearEndForecast.ts` separately owns Dynamic Nelson-Siegel estimation, the random-walk benchmark, rolling-origin combination, and empirical intervals. `features/weekly/WeeklyCurveOutlook.tsx` only renders those results. The methodology and limitations are documented in [weekly-outlook.md](./weekly-outlook.md).

Frontend modules import from `src/` through the `@/` alias. Files within the same feature may use a local relative import. This keeps moves within one feature inexpensive without introducing long parent-directory paths.

## Server Ownership

Vercel requires the public handlers to remain in `api/`. These handlers should validate request-level inputs, apply deployment-cache headers, and delegate data work to `server/clients/`.

`server/clients/` owns source retrieval, parsing, validation, and normalized payload construction. Shared source definitions and maturity mappings remain in `server/config.js`; the local production server remains in `server/index.js`.

## Adding Work

1. Add user-facing behavior to the feature that owns it.
2. Add reusable financial logic to `src/domain/treasury/` and cover it in `scripts/verify-research.mjs`.
3. Add source integration logic to `server/clients/` and cover it in the corresponding verification script.
4. Keep `api/` handlers thin and keep generated `dist/` and local `.vercel/` output untracked.
