from fastapi import APIRouter

from app.api.routes import ai, auth, jobs

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(jobs.router)
api_router.include_router(ai.router)
