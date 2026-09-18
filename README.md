# Blast Radius — Dependency Impact Mapper

See what breaks before it breaks — map your system's dependencies and understand the blast radius of any change.

## What it does

- Upload/paste a dependency JSON file, load sample data, paste a GitHub repo URL, or paste a GitHub PR URL.
- Renders an interactive dependency graph. Click any node to see everything upstream (what it depends on) and downstream (what breaks if it fails) highlighted, with a risk level and a plain-English risk summary.
- A system overview page ranks every component by blast radius. PR analysis highlights every file a PR changes at once and shows the combined blast radius before you merge.

## Project layout

- `src/` — React + TypeScript + Vite frontend
- `server/` — local Node/TypeScript backend: parses a repo's JS/TS import graph (relative imports, `require()`, re-exports, tsconfig path aliases, `package.json` subpath imports), analyzes a PR's combined blast radius, and generates risk summaries. DynamoDB/Bedrock calls are stubbed (see `// TODO` comments) pending real AWS credentials.

## Running locally

```bash
npm install
npm run dev          # frontend — http://localhost:5173
npm run server:dev   # backend  — http://localhost:8787 (separate terminal)
```

Other scripts: `npm run test` (vitest, frontend + backend), `npm run build` (production build), `npm run lint`.
