# AI Job Tracker

AI Job Tracker is a portfolio-grade full-stack web app for managing job applications as structured AI workspaces instead of spreadsheets.

The product combines:
- application tracking
- AI-powered job parsing
- candidate-to-role fit analysis
- per-job assistant chat
- structured follow-up and recruiter metadata
- candidate profile enrichment from CV files and GitHub

## Why this project is strong

This is not a simple CRUD demo. It shows:
- a real multi-step product workflow
- AI integration that does useful work instead of decorative chat
- structured backend logic for parsing, analysis, and workspace updates
- state-heavy frontend UX with routed pages, modal flows, and job-specific chat
- practical handling of unreliable external sources such as search pages, blocked pages, and careers pages

## Core product flow

1. Create or import a job from a link.
2. Let AI extract company, title, description, and requirements when possible.
3. Analyze the role against the candidate profile.
4. Open a dedicated workspace for that job.
5. Use the assistant to ask questions, track recruiter details, log application dates, and set follow-ups.
6. Enrich the candidate profile from a CV upload and GitHub link.

## Current features

### Dashboard
- pipeline overview with counts for total, saved, applied, and analyzed jobs
- best-match preview cards
- follow-up queue
- reminders and pipeline summary
- create-job modal instead of an always-open form

### Candidate profile
- dedicated `Profile` page
- multi-section candidate profile with:
  - headline
  - summary
  - preferred roles
  - target seniority
  - tech stack
  - skills
  - years of experience
  - English level
  - location
  - preferred locations
  - work format
  - relocation preference
  - salary expectation
  - GitHub URL
  - portfolio URL
- AI autofill from uploaded CV/screenshots and GitHub profile URL

### Job import
- manual role creation
- AI-assisted import from job links
- better handling for:
  - direct job pages
  - search results pages
  - company careers pages
  - blocked or JS-limited sources

### Fit analysis
- structured result with:
  - match score
  - strengths
  - missing skills
  - seniority fit
  - recommendation
  - summary
- improved heuristic fallback when full AI parsing or analysis is not available

### Per-job workspace
- dedicated route for each job
- job-scoped assistant chat
- chat attachments for screenshots and PDFs
- structured metadata panel:
  - application date
  - follow-up date
  - contact person
  - source
  - workspace summary
- natural language updates such as:
  - `I applied today`
  - `Recruiter is Anna Smith`
  - `Follow up in 3 days`

## Tech stack

### Frontend
- React 19
- TypeScript
- Vite
- React Router

### Backend
- FastAPI
- SQLAlchemy
- Pydantic v2
- JWT auth

### Data and AI
- PostgreSQL in the intended production setup
- local SQLite supported for development/testing
- Anthropic Claude API for live AI behavior
- fallback deterministic logic when AI is unavailable

## Repository structure

```text
frontend/   React + TypeScript client
backend/    FastAPI API and AI services
```

## Local development

### Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Set at least:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CORS_ORIGINS`
3. Optionally add:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL`
4. Use Python `3.13`

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## Environment variables

Example backend env file:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/ai_job_tracker
JWT_SECRET=change-me
JWT_EXPIRE_MINUTES=1440
CORS_ORIGINS=http://localhost:5173
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
```

For local testing with a different frontend port such as `5174`, include it in `CORS_ORIGINS`.

## AI modes

The app supports two execution modes:

### Live AI mode
- uses Anthropic Claude through the backend
- can parse links, analyze roles, inspect chat attachments, and enrich the profile

### Fallback mode
- used when AI is unavailable or the source is too limited
- still provides structured parsing, analysis, and job chat behavior
- keeps the product demoable and resilient

## Known limitations

- some job boards block scraping or hide the full role behind JavaScript/authentication
- search results pages and company pages cannot be analyzed as accurately as direct vacancy pages
- the candidate profile is currently frontend-managed state rather than a dedicated persisted backend profile model
- the project currently optimizes for product flow and portfolio storytelling over production-grade infra completeness

## Recommended deploy plan

- Frontend: Vercel
- Backend: Render, Railway, or Fly.io
- Database: managed PostgreSQL

Before deploy:
- set `ANTHROPIC_API_KEY`
- set a production `JWT_SECRET`
- set the final frontend origin in `CORS_ORIGINS`
- switch `DATABASE_URL` to the production database

## Portfolio positioning

This project is a strong portfolio piece for frontend, backend, and full-stack roles because it demonstrates:
- AI product thinking
- complex state and UX design
- API design with structured schemas
- practical handling of noisy real-world data sources
- a credible user-facing workflow that feels like a real product, not a toy demo
