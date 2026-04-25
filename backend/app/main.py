from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.router import api_router
from app.core.config import get_settings
from app.db.base import Job, User
from app.db.session import Base, engine

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_stage4_job_columns() -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns("jobs")}
    missing = [
        ("job_description", "TEXT DEFAULT ''"),
        ("extracted_requirements", "JSON"),
        ("analysis", "JSON"),
        ("workspace_metadata", "JSON"),
        ("messages", "JSON"),
    ]
    if not missing:
        return

    with engine.begin() as connection:
        for column_name, column_type in missing:
            if column_name in existing_columns:
                continue
            connection.execute(text(f"ALTER TABLE jobs ADD COLUMN {column_name} {column_type}"))


@app.on_event("startup")
def on_startup() -> None:
    _ = (User, Job)
    Base.metadata.create_all(bind=engine)
    ensure_stage4_job_columns()


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
