from fastapi import APIRouter

from app.api.v1.routers import auth, candidates, interviews, jobs, reports

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(jobs.router)
api_router.include_router(candidates.router)
api_router.include_router(interviews.router)
api_router.include_router(reports.router)
