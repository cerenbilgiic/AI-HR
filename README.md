# AI-HR — AI-Powered Interview Pre-Screening Platform (PoC)

Proof-of-concept AI interview pre-screening platform for retail hiring. Candidates complete an AI-driven interview (CV-aware question generation, speech-to-text, answer evaluation) before meeting a human recruiter; HR reviews structured reports in a dashboard.

Full requirements: [claude.md](claude.md) (product spec) and [claude2.md](claude2.md) (local-only AI runtime requirements).

This PoC runs entirely on local infrastructure: no paid AI APIs. The LLM is served locally via [Ollama](https://ollama.com), speech-to-text via local Whisper (`faster-whisper`), and the database is a local MySQL instance.

## Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Alembic, JWT auth
- **Database**: MySQL (localhost)
- **AI**: Local LLM via Ollama (default: `qwen3:8b`), local Whisper STT via `faster-whisper`
- **Frontend**: React, TypeScript, Tailwind CSS (Vite)

## Prerequisites

- Python 3.11+
- Node.js 18+
- MySQL Community Server running on localhost
- [Ollama](https://ollama.com) installed, with the model pulled: `ollama pull qwen3:8b`

## Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then fill in DATABASE_URL etc.
alembic upgrade head
uvicorn app.main:app --reload
```

API docs available at `http://localhost:8000/docs`.

## Frontend setup

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Project structure

```
backend/    FastAPI app (layered: api -> services -> AI services -> SQLAlchemy models -> MySQL)
frontend/   React + TypeScript + Tailwind SPA (HR dashboard + candidate interview flow)
```

See `backend/app/services/ai/base.py` for the AI provider interface — the local Ollama/Whisper implementation can be swapped for a cloud provider later without touching callers.
