# CTO — Chief Talent Officer

CTO is a context-aware career copilot that constructs a unified knowledge base from every artifact you share — resumes, LinkedIn, GitHub, market research, recruiter notes, and more. That shared profile lets the product extract the right wins for each job description, tailor outreach, and keep HR conversations cohesive. Under the hood, a Vite/React experience (`/web`) talks to an Express + TypeScript API (`/api`) that ingests sources, normalizes context, and orchestrates secure storage.

## Why CTO?

- **Unified knowledge base** – Aggregate every document into Supabase-backed context so the AI always “remembers” the candidate.
- **Immediate personalization** – Use that shared profile to tailor resumes, cover letters, and HR messages for each JD automatically.
- **Actionable job workflow** – Browse curated roles, apply the unified profile as a lens, and ship tailored assets without leaving the product.
- **Extensible architecture** – Storage adapters and modular pipelines keep business logic isolated from any single vendor.

## Repository layout

| Path | Description |
| --- | --- |
| `/api` | Express service, resume parsing pipeline, fit scoring engine, Supabase integration, automated tests. [Docs](./api/docs/) |
| `/web` | Vite + React front-end, Tailwind UI system, Zustand profile store, React Query networking. |
| `/resources` | Prompt templates and product collateral. |
| `/supabase` | Database schema plus SQL migrations grouped under `supabase/migrations/`. |
| `docker-compose.yml` | Spins up API + web with sensible defaults for local dev. |

## Getting started

> Requirements: Node 18+, pnpm 8+

```bash
# Install all workspace dependencies
pnpm install

# Copy env templates
cp api/.env.example api/.env
cp web/.env.example web/.env

# Update secrets: OPENAI_API_KEY, Supabase keys, and VITE_API_URL

# Launch both services
pnpm -w dev   # API on :8080, web on :5173
```

### Project scripts

```bash
pnpm -w dev     # Run API + web in watch mode
pnpm -w test    # Run Vitest suites for both workspaces
pnpm -w build   # Type-checks + builds production bundles
pnpm -w lint    # Type-level linting via tsc --noEmit
```

### Environment essentials

- `api/.env` & `api/.env.example` enumerate OpenAI keys, Supabase connection info, optional FileStore toggles.
- `web/.env` configures `VITE_API_URL` (defaults to `http://localhost:8080/api`) plus Supabase public keys.
- Docker users can override `WEB_ORIGIN`/`API_ORIGIN` to point to externally reachable hosts.

## Feature tour

### Knowledge base ingestion
Upload resumes, link profiles, or add HR research into the knowledge base. Files are parsed via `pdf-parse`, `mammoth`, and OpenAI-assisted analysis before landing in Supabase with automated summaries and semantic tags.

### Context extraction & tailored assets
Extraction helpers convert the unified profile into structured traits and highlights so downstream generators can pull the best proof points for each JD. Shared utilities (scoring modules, profile normalizers, and prompt templates) keep the front end and API aligned on how context is interpreted.

### Guided job workflow
1. Self-assessment wizard captures core profile facts.
2. Resume upload refreshes the knowledge base and enriches the profile graph.
3. Dashboard surfaces top matches alongside calls to action for resume tailoring and HR outreach.
4. Knowledge base + applications tracker keep a timeline of what’s been tried.

### Extensibility hooks
- Storage adapters (`StorageAdapter`, `InMemoryStore`, `FileStore`) abstract persistence so DynamoDB/RDS swaps are straightforward.
- Supabase SQL lives in `supabase/schema.sql` and incremental files under `supabase/migrations/`.
- Front-end consumes typed API responses via `web/src/api/client.ts`, keeping auth and headers in one place.

## Troubleshooting

- **Frontend can’t reach API** – Confirm `VITE_API_URL` inside `web/.env` and restart `pnpm dev`.
- **Context extraction disabled** – `OPENAI_API_KEY` or Supabase creds missing in `api/.env`. Restart API after changes.
- **File upload rejected** – Max 3 MB PDF/DOCX, enforced by Multer + MIME guards; errors bubble up to toasts.
- **Rate limiting** – Resume analysis capped at 10/hour per IP; wait or update the limiter config if running privately.

Happy shipping with your personal Chief Talent Officer. 🚀
