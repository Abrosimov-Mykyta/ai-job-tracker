from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
import re
from urllib import error, parse, request

from app.core.config import get_settings
from app.models.job import JobStatus
from app.schemas.ai import (
    AnalyzeJobRequest,
    AnalyzeJobResponse,
    ChatJobRequest,
    ChatJobResponse,
    JobAnalysisPayload,
    JobMessagePayload,
    JobMetadataPayload,
    ParseJobRequest,
    ParseJobResponse,
)

settings = get_settings()


KEYWORDS = [
    "React",
    "TypeScript",
    "JavaScript",
    "Python",
    "FastAPI",
    "PostgreSQL",
    "API",
    "APIs",
    "Product Thinking",
    "Frontend Architecture",
    "UX",
    "Cloud",
    "Communication",
]


def _normalize(text: str) -> str:
    return text.strip().lower()


def _now() -> datetime:
    return datetime.now(UTC)


def _today() -> str:
    return _now().date().isoformat()


def _days_from_now(days: int) -> str:
    return (_now() + timedelta(days=days)).date().isoformat()


def _format_date(value: str) -> str:
    return datetime.fromisoformat(f"{value}T00:00:00+00:00").strftime("%b %d, %Y")


def _infer_requirements(text: str) -> list[str]:
    detected = [item for item in KEYWORDS if item.lower() in text.lower()]
    if detected:
        return detected
    return ["Communication", "Execution", "Product Thinking"]


def parse_job_fallback(payload: ParseJobRequest) -> ParseJobResponse:
    url = str(payload.job_url)
    parsed_url = parse.urlparse(url)
    host_parts = parsed_url.netloc.split(".")
    company = host_parts[-2].capitalize() if len(host_parts) >= 2 else "Unknown company"

    path_tokens = [
        token
        for token in re.split(r"[-_/]+", parsed_url.path)
        if token and token not in {"jobs", "job", "careers", "search"}
    ]
    title = " ".join(token.capitalize() for token in path_tokens[:5]) or "Job opportunity"

    raw_text = payload.job_html or " ".join(path_tokens) or url
    requirements = _infer_requirements(raw_text)
    description = (
        payload.job_html.strip()
        if payload.job_html
        else f"Imported from {parsed_url.netloc}. Review the original listing to confirm salary, requirements, and responsibilities."
    )

    return ParseJobResponse(
        company=company,
        title=title,
        link=url,
        job_description=description,
        extracted_requirements=requirements,
        metadata=JobMetadataPayload(source=parsed_url.netloc, notes_summary="Imported from job link."),
        parser_mode="fallback",
    )


def analyze_job_fallback(payload: AnalyzeJobRequest) -> AnalyzeJobResponse:
    workspace = payload.workspace
    profile = payload.profile
    requirements = workspace.extracted_requirements or _infer_requirements(
        f"{workspace.title} {workspace.notes} {workspace.job_description}"
    )
    skill_names = {_normalize(skill.name) for skill in profile.skills}
    stack_names = {_normalize(item) for item in profile.tech_stack}

    matched = [
        requirement
        for requirement in requirements
        if _normalize(requirement) in skill_names or _normalize(requirement) in stack_names
    ]
    missing = [requirement for requirement in requirements if requirement not in matched]

    strong_role_fit = any(
        _normalize(role.split(" ")[0]) in _normalize(workspace.title) for role in profile.preferred_roles
    )

    score = 48 + len(matched) * 10 + (8 if strong_role_fit else 0)
    score += min(profile.years_of_experience * 3, 12)
    score -= len(missing) * 6
    score = max(22, min(96, score))

    seniority_fit = "good fit"
    if profile.years_of_experience <= 1 and re.search(r"senior|lead", workspace.title, re.I):
        seniority_fit = "too junior"
    elif profile.years_of_experience >= 6 and re.search(r"junior|intern", workspace.title, re.I):
        seniority_fit = "too senior"

    recommendation = "skip"
    if score >= 75:
        recommendation = "apply"
    elif score >= 55:
        recommendation = "consider"

    analysis = JobAnalysisPayload(
        match_score=score,
        strengths=matched or ["Transferable engineering foundation"],
        missing_skills=missing or ["No obvious critical gaps"],
        seniority_fit=seniority_fit,
        recommendation=recommendation,
        summary=(
            "Strong overlap between the role and the candidate profile."
            if recommendation == "apply"
            else "There is some overlap, but review the gaps before investing more time."
            if recommendation == "consider"
            else "This role looks weaker against the current profile and may not be the best target."
        ),
    )

    metadata = payload.workspace.metadata or JobMetadataPayload()
    if not metadata.notes_summary:
        metadata.notes_summary = "Analysis created from current profile and job requirements."

    return AnalyzeJobResponse(analysis=analysis, metadata=metadata, provider_mode="fallback")


def chat_job_fallback(payload: ChatJobRequest) -> ChatJobResponse:
    message = payload.message.strip()
    lower = message.lower()

    metadata_patch = JobMetadataPayload()
    status_patch = None
    notes_append = None

    recruiter_match = re.search(r"recruiter is (.+)", message, re.I)
    if recruiter_match:
        recruiter = recruiter_match.group(1).strip()
        metadata_patch.contact_person = recruiter
        content = f"Saved. {recruiter} is now stored as the recruiter/contact person."
        return ChatJobResponse(
            assistant_message=JobMessagePayload(role="assistant", content=content, created_at=_now()),
            metadata_patch=metadata_patch,
            provider_mode="fallback",
        )

    if "i applied today" in lower:
        metadata_patch.application_date = _today()
        status_patch = JobStatus.APPLIED
        return ChatJobResponse(
            assistant_message=JobMessagePayload(
                role="assistant",
                content="Saved. I marked this role as applied and set the application date to today.",
                created_at=_now(),
            ),
            metadata_patch=metadata_patch,
            status_patch=status_patch,
            provider_mode="fallback",
        )

    follow_up_days_match = re.search(r"follow up in (\d+) days?", lower)
    if follow_up_days_match:
        days = int(follow_up_days_match.group(1))
        metadata_patch.follow_up_date = _days_from_now(days)
        return ChatJobResponse(
            assistant_message=JobMessagePayload(
                role="assistant",
                content=f"Done. I set the follow-up date to {_format_date(metadata_patch.follow_up_date)}.",
                created_at=_now(),
            ),
            metadata_patch=metadata_patch,
            provider_mode="fallback",
        )

    note_match = re.search(r"note[:\-]?\s+(.+)", message, re.I)
    if note_match:
        note_text = note_match.group(1).strip()
        metadata_patch.notes_summary = note_text
        notes_append = note_text
        return ChatJobResponse(
            assistant_message=JobMessagePayload(
                role="assistant",
                content="Saved. I added that note to the workspace summary and notes.",
                created_at=_now(),
            ),
            metadata_patch=metadata_patch,
            notes_append=notes_append,
            provider_mode="fallback",
        )

    analysis = payload.workspace.analysis
    if analysis:
        content = (
            f"For {payload.workspace.company}, your strongest fit is {analysis.strengths[0]}. "
            f"The main gap is {analysis.missing_skills[0]}. Recommendation: {analysis.recommendation}."
        )
    else:
        content = (
            "I can manage structured fields and answer job-specific questions here. "
            "Run analysis first for stronger fit guidance, or give me commands like "
            "'I applied today' or 'Recruiter is Anna Smith'."
        )

    return ChatJobResponse(
        assistant_message=JobMessagePayload(role="assistant", content=content, created_at=_now()),
        provider_mode="fallback",
    )


def _anthropic_request(system_prompt: str, user_prompt: str) -> str | None:
    if not settings.anthropic_api_key:
        return None

    payload = {
        "model": settings.anthropic_model,
        "max_tokens": 1200,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }

    req = request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=45) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    content = raw.get("content", [])
    if not content:
        return None
    text_parts = [part.get("text", "") for part in content if part.get("type") == "text"]
    return "\n".join(text_parts).strip() or None


def parse_job_with_optional_llm(payload: ParseJobRequest) -> ParseJobResponse:
    fallback = parse_job_fallback(payload)
    response_text = _anthropic_request(
        system_prompt=(
            "Extract company, title, short description, and requirement keywords from a job posting. "
            "Return strict JSON with keys company, title, job_description, extracted_requirements."
        ),
        user_prompt=f"Job URL: {payload.job_url}\nJob HTML/Text:\n{payload.job_html or ''}",
    )
    if not response_text:
        return fallback

    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        return fallback

    return ParseJobResponse(
        company=parsed.get("company") or fallback.company,
        title=parsed.get("title") or fallback.title,
        link=fallback.link,
        job_description=parsed.get("job_description") or fallback.job_description,
        extracted_requirements=parsed.get("extracted_requirements") or fallback.extracted_requirements,
        metadata=fallback.metadata,
        parser_mode="llm",
    )


def analyze_job_with_optional_llm(payload: AnalyzeJobRequest) -> AnalyzeJobResponse:
    fallback = analyze_job_fallback(payload)
    response_text = _anthropic_request(
        system_prompt=(
            "Compare a candidate profile against a job workspace. Return strict JSON with "
            "match_score, strengths, missing_skills, seniority_fit, recommendation, summary."
        ),
        user_prompt=json.dumps(payload.model_dump(mode="json"), ensure_ascii=False),
    )
    if not response_text:
        return fallback

    try:
        parsed = json.loads(response_text)
        analysis = JobAnalysisPayload(**parsed)
    except (json.JSONDecodeError, TypeError, ValueError):
        return fallback

    return AnalyzeJobResponse(
        analysis=analysis,
        metadata=fallback.metadata,
        provider_mode="llm",
    )


def chat_job_with_optional_llm(payload: ChatJobRequest) -> ChatJobResponse:
    fallback = chat_job_fallback(payload)
    response_text = _anthropic_request(
        system_prompt=(
            "You are a job-specific assistant. Help with this one workspace only. "
            "If the user gives a structured update command, return strict JSON with "
            "assistant_message, metadata_patch, notes_append, status_patch."
        ),
        user_prompt=json.dumps(payload.model_dump(mode="json"), ensure_ascii=False),
    )
    if not response_text:
        return fallback

    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        return fallback

    try:
        assistant_content = parsed.get("assistant_message") or fallback.assistant_message.content
        metadata_patch = (
            JobMetadataPayload(**parsed["metadata_patch"]) if parsed.get("metadata_patch") else None
        )
        return ChatJobResponse(
            assistant_message=JobMessagePayload(
                role="assistant",
                content=assistant_content,
                created_at=_now(),
            ),
            metadata_patch=metadata_patch,
            notes_append=parsed.get("notes_append"),
            status_patch=parsed.get("status_patch"),
            provider_mode="llm",
        )
    except (TypeError, ValueError):
        return fallback
