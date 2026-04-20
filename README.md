# AI Job Tracker

Portfolio-ready full-stack starter for an AI-powered job application tracker.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: FastAPI + SQLAlchemy + Pydantic
- Database: PostgreSQL
- Auth: JWT

## Stage 1 included

- Register / login flow
- Dashboard with applied and saved jobs
- Add job form
- Move jobs from `saved` to `applied`
- Decline jobs
- Job detail workspace shell
- Architecture ready for AI analysis, chat, reminders, and answer generation

## Current product state

- Stage 1: tracker, auth, saved/applied workflow
- Stage 2: candidate profile and structured fit analysis
- Stage 3: per-job workspace, chat history, and structured metadata updates
- Stage 4 backend foundation: `/api/ai/parse`, `/api/ai/analyze`, `/api/ai/chat`

The new AI endpoints support:

- fallback mode with deterministic local logic when no API key is configured
- optional Claude integration when `ANTHROPIC_API_KEY` is present in the backend environment
- backend-owned parsing, analysis, and job-scoped chat so the frontend never exposes provider keys

## Project structure

```text
frontend/   React app
backend/    FastAPI app
```

## Backend setup

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env`.
3. Update `DATABASE_URL`, `JWT_SECRET`, and optionally `ANTHROPIC_API_KEY`.
4. Use Python `3.13` for the backend virtual environment.
5. Install dependencies:

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`.

Note: FastAPI + Pydantic currently has rough edges in this workspace's Python `3.14` environment because `pydantic-core` does not install cleanly there yet. Use Python `3.13` locally or in deployment.

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Real AI path

When you are ready for live AI behavior:

1. Set `ANTHROPIC_API_KEY` in `backend/.env`
2. Run the backend with Python `3.13`
3. Switch the frontend from demo-only logic to the Stage 4 backend endpoints

Target workflow:

- paste a job link
- parse and extract fields on the backend
- analyze against the candidate profile
- fill the job workspace automatically
- continue inside the job-scoped assistant chat
