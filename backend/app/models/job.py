from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, DateTime, Enum as SqlEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class JobStatus(str, Enum):
    SAVED = "saved"
    APPLIED = "applied"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255))
    link: Mapped[str] = mapped_column(String(2048))
    status: Mapped[JobStatus] = mapped_column(SqlEnum(JobStatus), default=JobStatus.SAVED)
    notes: Mapped[str] = mapped_column(Text, default="")
    job_description: Mapped[str] = mapped_column(Text, default="")
    extracted_requirements: Mapped[list[str]] = mapped_column(JSON, default=list)
    analysis: Mapped[dict | None] = mapped_column(JSON, default=None, nullable=True)
    workspace_metadata: Mapped[dict | None] = mapped_column("workspace_metadata", JSON, default=None, nullable=True)
    messages: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User", back_populates="jobs")
