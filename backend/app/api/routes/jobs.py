from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.job import Job
from app.schemas.job import JobCreate, JobResponse, JobUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"])


def serialize_job(job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        company=job.company,
        title=job.title,
        link=job.link,
        status=job.status,
        notes=job.notes,
        job_description=job.job_description or "",
        extracted_requirements=job.extracted_requirements or [],
        analysis=job.analysis,
        metadata=job.workspace_metadata,
        messages=job.messages or [],
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("", response_model=list[JobResponse])
def list_jobs(db: DbSession, user: CurrentUser) -> list[JobResponse]:
    statement = select(Job).where(Job.user_id == user.id).order_by(Job.created_at.desc())
    return [serialize_job(job) for job in db.scalars(statement).all()]


@router.post("", response_model=JobResponse, status_code=201)
def create_job(payload: JobCreate, db: DbSession, user: CurrentUser) -> JobResponse:
    job = Job(
        user_id=user.id,
        company=payload.company,
        title=payload.title,
        link=str(payload.link),
        notes=payload.notes,
        job_description=payload.job_description,
        extracted_requirements=payload.extracted_requirements,
        analysis=payload.analysis.model_dump(mode="json") if payload.analysis else None,
        workspace_metadata=payload.metadata.model_dump(mode="json") if payload.metadata else None,
        messages=[message.model_dump(mode="json") for message in payload.messages],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return serialize_job(job)


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: DbSession, user: CurrentUser) -> JobResponse:
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return serialize_job(job)


@router.patch("/{job_id}", response_model=JobResponse)
def update_job(job_id: int, payload: JobUpdate, db: DbSession, user: CurrentUser) -> JobResponse:
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    changes = payload.model_dump(mode="json", exclude_unset=True)
    for field, value in changes.items():
        if value is not None:
            if field == "link":
                setattr(job, field, str(value))
            elif field == "analysis":
                job.analysis = value
            elif field == "metadata":
                job.workspace_metadata = value
            elif field == "messages":
                job.messages = value
            else:
                setattr(job, field, value)

    db.add(job)
    db.commit()
    db.refresh(job)
    return serialize_job(job)


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, db: DbSession, user: CurrentUser) -> None:
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    db.delete(job)
    db.commit()
