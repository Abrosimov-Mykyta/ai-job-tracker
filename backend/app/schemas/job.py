from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl

from app.models.job import JobStatus
from app.schemas.ai import JobAnalysisPayload, JobMessagePayload, JobMetadataPayload


class JobCreate(BaseModel):
    company: str = Field(min_length=2, max_length=255)
    title: str = Field(min_length=2, max_length=255)
    link: HttpUrl
    notes: str = Field(default="", max_length=5000)
    job_description: str = Field(default="", max_length=20000)
    extracted_requirements: list[str] = Field(default_factory=list)
    analysis: JobAnalysisPayload | None = None
    metadata: JobMetadataPayload | None = None
    messages: list[JobMessagePayload] = Field(default_factory=list)


class JobUpdate(BaseModel):
    company: str | None = Field(default=None, min_length=2, max_length=255)
    title: str | None = Field(default=None, min_length=2, max_length=255)
    link: HttpUrl | None = None
    status: JobStatus | None = None
    notes: str | None = Field(default=None, max_length=5000)
    job_description: str | None = Field(default=None, max_length=20000)
    extracted_requirements: list[str] | None = None
    analysis: JobAnalysisPayload | None = None
    metadata: JobMetadataPayload | None = None
    messages: list[JobMessagePayload] | None = None


class JobResponse(BaseModel):
    id: int
    company: str
    title: str
    link: str
    status: JobStatus
    notes: str
    job_description: str
    extracted_requirements: list[str]
    analysis: JobAnalysisPayload | None = None
    metadata: JobMetadataPayload | None = None
    messages: list[JobMessagePayload] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
