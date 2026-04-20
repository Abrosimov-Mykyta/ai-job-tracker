from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.job import Job
from app.schemas.job import JobCreate, JobResponse, JobUpdate

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobResponse])
def list_jobs(db: DbSession, user: CurrentUser) -> list[Job]:
    statement = select(Job).where(Job.user_id == user.id).order_by(Job.created_at.desc())
    return list(db.scalars(statement).all())


@router.post("", response_model=JobResponse, status_code=201)
def create_job(payload: JobCreate, db: DbSession, user: CurrentUser) -> Job:
    job = Job(
        user_id=user.id,
        company=payload.company,
        title=payload.title,
        link=str(payload.link),
        notes=payload.notes,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: DbSession, user: CurrentUser) -> Job:
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


@router.patch("/{job_id}", response_model=JobResponse)
def update_job(job_id: int, payload: JobUpdate, db: DbSession, user: CurrentUser) -> Job:
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is not None:
            setattr(job, field, str(value) if field == "link" else value)

    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, db: DbSession, user: CurrentUser) -> None:
    job = db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    db.delete(job)
    db.commit()

