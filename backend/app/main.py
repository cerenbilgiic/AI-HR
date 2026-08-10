from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import api_router
from app.core.config import settings
from app.services.data_retention import run_daily_retention_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        run_daily_retention_job,
        trigger=IntervalTrigger(days=1),
        id="daily_retention_sweep",
        # also run once shortly after startup, rather than only after the
        # first full day, so a long-lived deployment doesn't silently skip
        # a day if it was restarted right after the previous run
        next_run_time=datetime.now() + timedelta(minutes=5),
    )
    scheduler.start()
    app.state.scheduler = scheduler
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="AI-HR Interview Pre-Screening API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
