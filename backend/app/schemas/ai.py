from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

from app.models.job import JobStatus


class UserSkillPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    level: Literal["beginner", "intermediate", "advanced"]
    years: int = Field(ge=0, le=50)


class UserProfilePayload(BaseModel):
    headline: str = Field(default="", max_length=255)
    summary: str = Field(default="", max_length=4000)
    preferred_roles: list[str] = Field(default_factory=list)
    target_seniority: str = Field(default="", max_length=80)
    tech_stack: list[str] = Field(default_factory=list)
    skills: list[UserSkillPayload] = Field(default_factory=list)
    years_of_experience: int = Field(ge=0, le=50)
    english_level: str = Field(default="B2", max_length=50)
    location: str = Field(default="Remote", max_length=120)
    preferred_locations: list[str] = Field(default_factory=list)
    work_format: Literal["remote", "hybrid", "office"] = "remote"
    open_to_relocate: bool = False
    salary_expectation: str = Field(default="", max_length=120)
    github_url: str = Field(default="", max_length=255)
    portfolio_url: str = Field(default="", max_length=255)


class JobMetadataPayload(BaseModel):
    application_date: str | None = None
    follow_up_date: str | None = None
    contact_person: str | None = None
    source: str | None = None
    notes_summary: str | None = None


class JobMessagePayload(BaseModel):
    id: str | None = None
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)
    created_at: datetime | None = None
    attachment_names: list[str] = Field(default_factory=list)


class ChatAttachmentPayload(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    media_type: str = Field(min_length=1, max_length=120)
    data_base64: str = Field(min_length=1, max_length=20_000_000)


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


class WorkspacePatchPayload(BaseModel):
    company: str | None = Field(default=None, min_length=1, max_length=255)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    job_description: str | None = Field(default=None, max_length=20000)
    extracted_requirements: list[str] | None = None


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
    attachments: list[ChatAttachmentPayload] = Field(default_factory=list)


class ChatJobResponse(BaseModel):
    assistant_message: JobMessagePayload
    metadata_patch: JobMetadataPayload | None = None
    workspace_patch: WorkspacePatchPayload | None = None
    notes_append: str | None = None
    status_patch: JobStatus | None = None
    provider_mode: Literal["fallback", "llm"]


class ProfileImportRequest(BaseModel):
    profile: UserProfilePayload
    github_url: HttpUrl | None = None
    attachments: list[ChatAttachmentPayload] = Field(default_factory=list)


class ProfileImportResponse(BaseModel):
    profile: UserProfilePayload
    summary: str
    provider_mode: Literal["fallback", "llm"]
