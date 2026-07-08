# IPL-300 — App

React + TypeScript + Vite frontend. Talks to the Worker API in `../worker`.

## Run locally

```bash
npm install
npm run dev
```

By default the app points at `http://localhost:8787` for the API — make sure the Worker
(`../worker`) is running locally too (`npm run dev` in that directory). To point at a
deployed Worker instead, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL`.

## Build

```bash
npm run build
```

Outputs to `dist/`, ready for static hosting (e.g. GitHub Pages). Routing uses `HashRouter`
specifically so it works on static hosts without server-side rewrite rules.
