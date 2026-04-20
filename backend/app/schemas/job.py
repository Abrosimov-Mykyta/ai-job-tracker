from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl

from app.models.job import JobStatus


class JobCreate(BaseModel):
    company: str = Field(min_length=2, max_length=255)
    title: str = Field(min_length=2, max_length=255)
    link: HttpUrl
    notes: str = Field(default="", max_length=5000)


class JobUpdate(BaseModel):
    company: str | None = Field(default=None, min_length=2, max_length=255)
    title: str | None = Field(default=None, min_length=2, max_length=255)
    link: HttpUrl | None = None
    status: JobStatus | None = None
    notes: str | None = Field(default=None, max_length=5000)


class JobResponse(BaseModel):
    id: int
    company: str
    title: str
    link: str
    status: JobStatus
    notes: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

