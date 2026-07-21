# Repository Operating Guide

## Scope

This guide applies to the `treasury-curve-research` repository only.

Do not push, deploy, relink, or edit the legacy `treasury-rates-monitor` GitHub or Vercel projects. Production work for this repository targets:

- GitHub: `https://github.com/NavnoorBawa/treasury-curve-research`
- Vercel: `https://treasury-curve-research.vercel.app`

## Runtime

- Node.js: 22.x
- Package manager: npm using the committed `package-lock.json`
- Frontend: React, TypeScript, and Vite
- APIs: Node serverless functions under `api/`; Express serves local production builds

## Install And Run

```bash
npm ci
npm run dev
```

The Vite client runs at `http://localhost:5173` and proxies `/api` to the Express server at `http://localhost:4174`.

For a local production build:

```bash
npm run build
npm start
```

## Required Verification

Run the complete committed suite before and after every source or documentation change:

```bash
npm run verify
```

The release gate covers ESLint, the TypeScript production build, financial research logic, futures normalization, and official Treasury/H.15 data reconciliation. For individual static checks, run:

```bash
npm run lint
npm run typecheck
```

When network access is available, also run:

```bash
npm run verify:futures:live
npm audit --audit-level=high
```

## Financial Invariants

- Official CMT values come from U.S. Treasury XML; long-run history comes from Federal Reserve H.15 DDP.
- Daily changes compare consecutive published observations, not calendar days.
- Spreads equal long-tenor yield minus short-tenor yield and are expressed in basis points.
- Missing observations, weekends, holidays, and the official 30Y publication gap are never imputed.
- Futures data is an isolated delayed proxy and must never enter CMT yields, spreads, regimes, statistics, forecasts, or exports.
- Regime classifications are ex-post descriptions. Forecast output must remain visibly separated from observed data.

## Change Discipline

- Match existing naming and TypeScript/React patterns.
- Avoid new dependencies unless a release requirement cannot be met without one; document the reason in the commit message.
- Use `apply_patch` for manual edits.
- Keep `ISSUES.md` current with every finding, resolution, and accepted blocker.
- Do not weaken tests, source attribution, missing-data handling, or financial disclosures to make a check pass.

## Deployment

The linked Vercel project uses:

- Framework: Vite
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`

Before a production deployment, run `npm run verify`, check `git status`, and confirm `.vercel/project.json` identifies `treasury-curve-research`.
