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

## Project structure

```text
frontend/   React app
backend/    FastAPI app
```

## Backend setup

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env`.
3. Update `DATABASE_URL` and `JWT_SECRET`.
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

## Next stages

- Stage 2: AI job analysis against user profile
- Stage 3: Per-job chat workspace and structured metadata editing
- Stage 4: Follow-ups, generators, and smart insights
