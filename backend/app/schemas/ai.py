from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

from app.models.job import JobStatus


class UserSkillPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    level: Literal["beginner", "intermediate", "advanced"]
    years: int = Field(ge=0, le=50)


class UserProfilePayload(BaseModel):
    preferred_roles: list[str] = Field(default_factory=list)
    tech_stack: list[str] = Field(default_factory=list)
    skills: list[UserSkillPayload] = Field(default_factory=list)
    years_of_experience: int = Field(ge=0, le=50)
    english_level: str = Field(default="B2", max_length=50)
    location: str = Field(default="Remote", max_length=120)
    work_format: Literal["remote", "hybrid", "office"] = "remote"


class JobMetadataPayload(BaseModel):
    application_date: str | None = None
    follow_up_date: str | None = None
    contact_person: str | None = None
    source: str | None = None
    notes_summary: str | None = None


class JobMessagePayload(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)
    created_at: datetime | None = None


class JobAnalysisPayload(BaseModel):
    match_score: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    seniority_fit: Literal["too junior", "good fit", "too senior"]
    recommendation: Literal["apply", "consider", "skip"]
    summary: str


class JobWorkspacePayload(BaseModel):
    company: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    link: HttpUrl
    status: JobStatus = JobStatus.SAVED
    notes: str = Field(default="", max_length=12000)
    job_description: str = Field(default="", max_length=20000)
    extracted_requirements: list[str] = Field(default_factory=list)
    metadata: JobMetadataPayload | None = None
    analysis: JobAnalysisPayload | None = None
    messages: list[JobMessagePayload] = Field(default_factory=list)


class ParseJobRequest(BaseModel):
    job_url: HttpUrl
    job_html: str | None = Field(default=None, max_length=200000)


class ParseJobResponse(BaseModel):
    company: str
    title: str
    link: str
    job_description: str
    extracted_requirements: list[str]
    metadata: JobMetadataPayload
    parser_mode: Literal["fallback", "llm"]


class AnalyzeJobRequest(BaseModel):
    profile: UserProfilePayload
    workspace: JobWorkspacePayload


class AnalyzeJobResponse(BaseModel):
    analysis: JobAnalysisPayload
    metadata: JobMetadataPayload | None = None
    provider_mode: Literal["fallback", "llm"]


class ChatJobRequest(BaseModel):
    profile: UserProfilePayload
    workspace: JobWorkspacePayload
    message: str = Field(min_length=1, max_length=12000)


class ChatJobResponse(BaseModel):
    assistant_message: JobMessagePayload
    metadata_patch: JobMetadataPayload | None = None
    notes_append: str | None = None
    status_patch: JobStatus | None = None
    provider_mode: Literal["fallback", "llm"]
