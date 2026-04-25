from __future__ import annotations

from datetime import UTC, datetime, timedelta
from html import unescape
import json
import re
from uuid import uuid4
from urllib import error, parse, request

from app.core.config import get_settings
from app.models.job import JobStatus
from app.schemas.ai import (
    AnalyzeJobRequest,
    AnalyzeJobResponse,
    ChatAttachmentPayload,
    ChatJobRequest,
    ChatJobResponse,
    JobAnalysisPayload,
    JobMessagePayload,
    JobMetadataPayload,
    ParseJobRequest,
    ParseJobResponse,
    ProfileImportRequest,
    ProfileImportResponse,
    UserProfilePayload,
    WorkspacePatchPayload,
)

settings = get_settings()


KEYWORDS = [
    "React",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "Express.js",
    "Python",
    "FastAPI",
    "PostgreSQL",
    "Supabase",
    "Docker",
    "GraphQL",
    "REST",
    "n8n",
    "API",
    "APIs",
    "Product Thinking",
    "Frontend Architecture",
    "UX",
    "Cloud",
    "Communication",
]

REQUIREMENT_ALIASES: dict[str, set[str]] = {
    "React": {"react", "react.js", "reactjs"},
    "TypeScript": {"typescript", "ts"},
    "JavaScript": {"javascript", "js", "ecmascript"},
    "Node.js": {"node", "node.js", "nodejs"},
    "Express.js": {"express", "express.js", "expressjs"},
    "Python": {"python"},
    "FastAPI": {"fastapi"},
    "PostgreSQL": {"postgres", "postgresql"},
    "Supabase": {"supabase"},
    "Docker": {"docker", "containers", "containerization"},
    "GraphQL": {"graphql"},
    "REST": {"rest", "rest api", "restful", "restful api"},
    "API": {"api", "apis", "integrations", "integration"},
    "Cloud": {"cloud", "aws", "gcp", "azure"},
    "Communication": {"communication", "stakeholder", "collaboration", "cross-functional"},
    "Product Thinking": {"product thinking", "product mindset", "customer empathy", "product"},
    "Frontend Architecture": {"frontend architecture", "design systems", "component architecture"},
    "UX": {"ux", "user experience", "interaction design"},
}

ROLE_FAMILIES: dict[str, set[str]] = {
    "frontend": {"frontend", "react", "ui", "web", "client"},
    "backend": {"backend", "api", "server", "python", "node", "integrations"},
    "full-stack": {"full stack", "full-stack", "frontend", "backend"},
    "product": {"product", "pm", "manager"},
    "data": {"data", "analytics", "bi", "sql"},
}

NOISY_TITLE_SUFFIXES = [
    " | linkedin",
    " | indeed",
    " | glassdoor",
    " | jobs",
    " - linkedin",
    " - indeed",
]

MODEL_FALLBACKS = [
    "claude-sonnet-4-6",
    "claude-sonnet-4-20250514",
]

SOURCE_PLATFORMS = {
    "indeed",
    "linkedin",
    "wellfound",
    "djinni",
    "glassdoor",
}


def _normalize(text: str) -> str:
    return text.strip().lower()


def _normalize_token(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _normalize(text)).strip()


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


def _collect_profile_terms(profile: UserProfilePayload) -> set[str]:
    terms: set[str] = set()
    for value in [
        profile.headline,
        profile.summary,
        profile.english_level,
        profile.location,
        profile.target_seniority,
        profile.work_format,
        profile.github_url,
        profile.portfolio_url,
        *profile.preferred_roles,
        *profile.preferred_locations,
    ]:
        normalized_value = _normalize_token(value)
        if normalized_value:
            terms.add(normalized_value)

    for skill in profile.skills:
        terms.add(_normalize_token(skill.name))
        for canonical, aliases in REQUIREMENT_ALIASES.items():
            if _normalize_token(skill.name) == _normalize_token(canonical) or _normalize_token(skill.name) in aliases:
                terms.update(aliases)
                terms.add(_normalize_token(canonical))

    for item in profile.tech_stack:
        terms.add(_normalize_token(item))
        for canonical, aliases in REQUIREMENT_ALIASES.items():
            if _normalize_token(item) == _normalize_token(canonical) or _normalize_token(item) in aliases:
                terms.update(aliases)
                terms.add(_normalize_token(canonical))

    return {term for term in terms if term}


def _english_level_rank(value: str) -> int:
    normalized = _normalize_token(value)
    mapping = {
        "a1": 1,
        "a2": 2,
        "b1": 3,
        "b1/b2": 4,
        "b2": 5,
        "c1": 6,
        "c2": 7,
        "upper-intermediate": 5,
        "intermediate": 3,
        "advanced": 6,
        "fluent": 7,
    }
    return mapping.get(normalized, 0)


def _requirement_labels(requirement: str) -> list[str]:
    normalized = _normalize_token(requirement)
    labels: list[str] = []

    for canonical, aliases in REQUIREMENT_ALIASES.items():
        candidate_terms = {canonical_normalized for canonical_normalized in [_normalize_token(canonical)]}
        candidate_terms.update(aliases)
        if any(term in normalized for term in candidate_terms):
            if canonical not in labels:
                labels.append(canonical)

    if re.search(r"\breact\b", normalized) and "React" not in labels:
        labels.append("React")
    if re.search(r"\btypescript\b|\bts\b", normalized) and "TypeScript" not in labels:
        labels.append("TypeScript")
    if re.search(r"\bredux\b|\brxjs\b", normalized):
        labels.append("Modern frontend architecture")
    if re.search(r"\bresponsive\b|\bperformance\b|\bweb development principles\b", normalized):
        labels.append("Frontend Architecture")
    if re.search(r"\bmui\b|\bstyled-components\b|\bdesign systems?\b|\bui component libraries?\b", normalized):
        labels.append("Design systems")
    if re.search(r"\bgit\b", normalized):
        labels.append("Git")
    if re.search(r"\bagile\b", normalized):
        labels.append("Agile collaboration")
    if re.search(r"\benglish\b|\bb2\b|upper-intermediate", normalized):
        labels.append("B2 English")
    if re.search(r"\bremote\b|\bhybrid\b|\bonsite\b", normalized):
        labels.append("Work format")
    if re.search(r"(\d+)\+?\s+years?", normalized):
        labels.append("Years of experience")

    deduped: list[str] = []
    for label in labels:
        if label not in deduped:
            deduped.append(label)

    if deduped:
        return deduped

    compact = requirement.strip()
    if len(compact) > 88:
        compact = compact[:85].rstrip(" ,.;:") + "..."
    return [compact]


def _canonicalize_requirement(requirement: str) -> str:
    normalized = _normalize_token(requirement)
    for canonical, aliases in REQUIREMENT_ALIASES.items():
        if normalized == _normalize_token(canonical) or normalized in aliases:
            return canonical
    return requirement.strip()


def _requirement_match_kind(requirement: str, profile_terms: set[str], profile: UserProfilePayload) -> str:
    normalized = _normalize_token(requirement)
    canonical = _canonicalize_requirement(requirement)
    canonical_normalized = _normalize_token(canonical)
    aliases = REQUIREMENT_ALIASES.get(canonical, {canonical_normalized})

    if normalized in profile_terms or canonical_normalized in profile_terms:
        return "direct"
    if aliases & profile_terms:
        return "direct"
    if any(alias in normalized for alias in aliases):
        return "direct"
    if canonical == "Years of experience":
        years_match = re.search(r"(\d+)\+?\s+years?", normalized)
        if years_match and profile.years_of_experience >= int(years_match.group(1)):
            return "direct"
    if canonical == "B2 English":
        required_rank = 5 if "b2" in normalized or "upper-intermediate" in normalized else 3
        if _english_level_rank(profile.english_level) >= required_rank:
            return "direct"
    if canonical == "Work format":
        if "remote" in normalized and profile.work_format == "remote":
            return "direct"
        if "hybrid" in normalized and profile.work_format in {"hybrid", "remote"}:
            return "transferable"
        if "onsite" in normalized and profile.work_format == "office":
            return "direct"
    if canonical == "API" and any(term in profile_terms for term in {"fastapi", "rest", "rest api", "graphql"}):
        return "transferable"
    if canonical == "Communication":
        return "soft"
    if canonical == "Product Thinking":
        return "soft"
    if canonical == "Cloud" and any(term in profile_terms for term in {"docker", "postgresql", "supabase"}):
        return "transferable"
    if canonical == "Modern frontend architecture" and any(
        term in profile_terms for term in {"react", "typescript", "javascript", "frontend engineer", "frontend architecture"}
    ):
        return "transferable"
    if canonical == "Design systems" and any(
        term in profile_terms for term in {"react", "frontend architecture", "ux"}
    ):
        return "transferable"
    if canonical == "Git" and "git" in profile_terms:
        return "direct"
    return "missing"


def _role_family(text: str) -> str | None:
    lowered = _normalize(text)
    for family, markers in ROLE_FAMILIES.items():
        if any(marker in lowered for marker in markers):
            return family
    return None


def _profile_role_families(profile: UserProfilePayload) -> set[str]:
    families = {_role_family(role) for role in profile.preferred_roles}
    families.update({_role_family(skill.name) for skill in profile.skills})
    families.update({_role_family(item) for item in profile.tech_stack})
    return {family for family in families if family}


def _workspace_role_family(workspace: AnalyzeJobRequest | object) -> str | None:
    candidate = workspace.workspace if hasattr(workspace, "workspace") else workspace
    combined = f"{getattr(candidate, 'title', '')} {getattr(candidate, 'job_description', '')}"
    return _role_family(combined)


def _analysis_summary(
    recommendation: str,
    seniority_fit: str,
    direct_matches: list[str],
    transferable_matches: list[str],
    missing: list[str],
) -> str:
    generic_labels = {"Years of experience", "B2 English", "Work format"}
    top_direct = [label for label in _prioritize_match_labels(direct_matches) if label not in generic_labels]
    if not top_direct:
        top_direct = _prioritize_match_labels(direct_matches)

    if recommendation == "apply":
        if direct_matches:
            return (
                f"Strong fit overall. Your best overlap is in {', '.join(top_direct[:2])}, "
                f"and the role looks like a {seniority_fit} role for your current profile."
            )
        return "Strong overall fit with enough relevant overlap to justify applying."

    if recommendation == "consider":
        if missing:
            return (
                f"There is real overlap here, but you should be ready to address gaps around "
                f"{', '.join(missing[:2])} before applying."
            )
        if transferable_matches:
            return (
                f"This role is viable mostly on transferable overlap such as {', '.join(transferable_matches[:2])}. "
                "It may still be worth applying if the team is flexible."
            )
        return "There is some overlap, but this role still needs a closer manual review before you invest more time."

    if missing:
        return (
            f"The fit is weak right now because several core requirements are still missing, especially "
            f"{', '.join(missing[:2])}."
        )
    return "The fit looks weak right now and probably is not the best use of your application time."


def _job_requirements_preview(workspace: AnalyzeJobRequest | ChatJobRequest | object) -> list[str]:
    candidate = workspace.workspace if hasattr(workspace, "workspace") else workspace
    requirements = getattr(candidate, "extracted_requirements", None) or _infer_requirements(
        f"{getattr(candidate, 'title', '')} {getattr(candidate, 'job_description', '')} {getattr(candidate, 'notes', '')}"
    )
    return [_canonicalize_requirement(item) for item in requirements][:8]


def _prioritize_match_labels(labels: list[str]) -> list[str]:
    priority_map = {
        "React": 1,
        "TypeScript": 1,
        "JavaScript": 1,
        "Node.js": 1,
        "Frontend Architecture": 2,
        "API": 2,
        "Git": 2,
        "Design systems": 3,
        "Modern frontend architecture": 3,
        "Years of experience": 4,
        "B2 English": 5,
        "Work format": 6,
    }
    return sorted(labels, key=lambda label: (priority_map.get(label, 3), label.lower()))


def _job_summary_text(workspace: AnalyzeJobRequest | ChatJobRequest | object) -> str:
    candidate = workspace.workspace if hasattr(workspace, "workspace") else workspace
    base = getattr(candidate, "job_description", "") or getattr(candidate, "notes", "") or ""
    cleaned = re.sub(r"\s+", " ", base).strip()
    if not cleaned:
        return f"{getattr(candidate, 'title', 'This role')} at {getattr(candidate, 'company', 'the company')}."
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    return " ".join(sentences[:2])[:320]


def _recruiter_questions(workspace: AnalyzeJobRequest | ChatJobRequest | object, analysis: JobAnalysisPayload | None) -> str:
    requirements = _job_requirements_preview(workspace)
    missing = analysis.missing_skills[:2] if analysis else requirements[:2]
    prompts = [
        "What does success look like in the first 90 days for this role?",
        f"Which of these areas matter most in practice: {', '.join(requirements[:3]) or 'the core stack'}?",
        f"How flexible is the team around experience gaps in {', '.join(missing) or 'adjacent skills'}?",
    ]
    return "\n".join(f"- {item}" for item in prompts)


def _should_apply_response(workspace: JobWorkspacePayload, analysis: JobAnalysisPayload | None) -> str:
    if analysis:
        if analysis.recommendation == "apply":
            return (
                f"I would apply. Your strongest overlap is in {', '.join(analysis.strengths[:2])}, "
                f"and the role looks {analysis.seniority_fit} for you."
            )
        if analysis.recommendation == "consider":
            return (
                f"I'd call this a selective apply. There is enough overlap to justify a shot, "
                f"but you should be ready to explain gaps around {', '.join(analysis.missing_skills[:2])}."
            )
        return (
            f"I would probably skip this one unless you have extra context not captured here. "
            f"The main issue is the gap around {', '.join(analysis.missing_skills[:2])}."
        )

    requirements = _job_requirements_preview(workspace)
    return (
        f"I'd review it manually before deciding. The role seems to lean on {', '.join(requirements[:3])}, "
        "but I do not have a full fit analysis yet."
    )


def _message(role: str, content: str, created_at: datetime | None = None) -> JobMessagePayload:
    timestamp = created_at or _now()
    return JobMessagePayload(
        id=f"{role}-{uuid4().hex[:10]}",
        role=role,
        content=content,
        created_at=timestamp,
    )


def _strip_html(raw_html: str) -> str:
    without_scripts = re.sub(r"<(script|style)[^>]*>.*?</\\1>", " ", raw_html, flags=re.I | re.S)
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    text = re.sub(r"\s+", " ", unescape(without_tags)).strip()
    return text[:12000]


def _clean_title(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    lower = cleaned.lower()
    for suffix in NOISY_TITLE_SUFFIXES:
        if lower.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip(" |-")
            lower = cleaned.lower()
    return cleaned


def _clean_company(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" |-")
    cleaned = re.sub(r"\b(hiring|careers|jobs)\b.*$", "", cleaned, flags=re.I).strip(" |-")
    return cleaned


def _title_case_slug(value: str) -> str:
    return " ".join(part.capitalize() for part in re.split(r"[-_]+", value) if part)


def _source_host(job_url: str) -> str:
    return parse.urlparse(job_url).netloc.lower().removeprefix("www.")


def _source_domain(job_url: str) -> str:
    host = _source_host(job_url)
    parts = [part for part in host.split(".") if part]
    if len(parts) >= 2:
        return parts[-2]
    return host


def _extract_job_id(job_url: str) -> str | None:
    parsed_url = parse.urlparse(job_url)
    current_job_id = parse.parse_qs(parsed_url.query).get("currentJobId", [])
    if current_job_id:
        return current_job_id[0]

    view_match = re.search(r"/view/(\d+)", parsed_url.path)
    if view_match:
        return view_match.group(1)
    return None


def _candidate_job_urls(job_url: str) -> list[str]:
    parsed_url = parse.urlparse(job_url)
    urls = [job_url]
    if "linkedin.com" in parsed_url.netloc:
        job_id = _extract_job_id(job_url)
        if job_id:
            urls.insert(0, f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}")
    return list(dict.fromkeys(urls))


def _extract_domain_company(job_url: str) -> str | None:
    parsed_url = parse.urlparse(job_url)
    path_parts = [part for part in parsed_url.path.split("/") if part]
    if "company" in path_parts:
        idx = path_parts.index("company")
        if idx + 1 < len(path_parts):
            return _title_case_slug(path_parts[idx + 1])

    host_parts = [part for part in parsed_url.netloc.split(".") if part and part != "www"]
    if len(host_parts) >= 2:
        domain_name = host_parts[-2]
        if domain_name not in SOURCE_PLATFORMS:
            return _title_case_slug(domain_name)
    return None


def _extract_title_from_url(job_url: str) -> str | None:
    parsed_url = parse.urlparse(job_url)
    query = parse.parse_qs(parsed_url.query)

    for key in ["job_listing_slug", "jk", "vjk"]:
        values = query.get(key, [])
        if key == "job_listing_slug" and values:
            return _title_case_slug(values[0])

    path_parts = [part for part in parsed_url.path.split("/") if part]
    if path_parts:
        last = path_parts[-1]
        cleaned = re.sub(r"^\d+[-_]*", "", last)
        cleaned = re.sub(r"[-_]*\d+$", "", cleaned)
        if cleaned and cleaned not in {"jobs", "job", "company", "careers"}:
            return _title_case_slug(cleaned)
    return None


def _fetch_url_content(job_url: str) -> tuple[str, str]:
    req = request.Request(
        job_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
            )
        },
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            content_type = response.headers.get("content-type", "")
            raw_body = response.read(200_000).decode("utf-8", errors="ignore")
    except (error.URLError, TimeoutError, ValueError):
        return "", ""

    return raw_body, content_type


def _fetch_job_page_text(job_url: str) -> str:
    for candidate_url in _candidate_job_urls(job_url):
        raw_body, content_type = _fetch_url_content(candidate_url)
        if not raw_body:
            continue

        if "text/html" in content_type.lower() or "<html" in raw_body.lower():
            text = _strip_html(raw_body)
        else:
            text = raw_body[:12000].strip()

        if text:
            return text
    return ""


def _extract_meta(raw_html: str, key: str) -> str | None:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+name=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_html, re.I)
        if match:
            return match.group(1).strip()
    return None


def _extract_title_company_from_html(raw_html: str, job_url: str) -> tuple[str | None, str | None]:
    title_candidates = [
        _extract_meta(raw_html, "og:title"),
        _extract_meta(raw_html, "twitter:title"),
    ]
    title_tag = re.search(r"<title[^>]*>(.*?)</title>", raw_html, re.I | re.S)
    if title_tag:
        title_candidates.append(title_tag.group(1))

    title = next((candidate for candidate in title_candidates if candidate and candidate.strip()), None)
    title = _clean_title(title) if title else None

    company = None
    company_patterns = [
        r'"companyName":"([^"]+)"',
        r'"company":"([^"]+)"',
        r'"hiringOrganization":\{"@type":"Organization","name":"([^"]+)"',
        r'data-company-name="([^"]+)"',
    ]
    for pattern in company_patterns:
        match = re.search(pattern, raw_html, re.I)
        if match:
            company = _clean_company(match.group(1))
            break

    if not company and title:
        title_parts = re.split(r"\s+at\s+|\s+\|\s+|\s+-\s+", title, maxsplit=1, flags=re.I)
        if len(title_parts) == 2:
            title = _clean_title(title_parts[0])
            company = _clean_company(title_parts[1])

    if not title and "linkedin.com" in parse.urlparse(job_url).netloc:
        job_id = _extract_job_id(job_url)
        if job_id:
            title = f"LinkedIn job {job_id}"

    return title, company


def _extract_job_listings_from_html(raw_html: str) -> list[str]:
    seen: set[str] = set()
    listings: list[str] = []

    for match in re.finditer(r'href=["\'](/jobs/[^"\']+)["\'][^>]*>(.*?)</a>', raw_html, re.I | re.S):
        text = _clean_title(_strip_html(match.group(2)))
        if len(text) < 4:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        listings.append(text)
        if len(listings) >= 8:
            break

    if listings:
        return listings

    fallback_patterns = [
        r'<h3[^>]*>(.*?)</h3>',
        r'<h2[^>]*>(.*?)</h2>',
    ]
    for pattern in fallback_patterns:
        for match in re.finditer(pattern, raw_html, re.I | re.S):
            text = _clean_title(_strip_html(match.group(1)))
            if len(text) < 6:
                continue
            if any(token in text.lower() for token in ["jobs", "careers", "overview", "people", "funding"]):
                continue
            lowered = text.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            listings.append(text)
            if len(listings) >= 8:
                return listings

    return listings


def _is_blocked_page(raw_html: str) -> bool:
    lowered = raw_html.lower()
    blocked_markers = [
        "blocked - indeed.com",
        "access denied",
        "request has been blocked",
        "please enable js and disable any ad blocker",
        "captcha-delivery",
        "challenge-platform",
        "cloudflare",
    ]
    return any(marker in lowered for marker in blocked_markers)


def _is_search_results_page(job_url: str, raw_html: str) -> bool:
    parsed_url = parse.urlparse(job_url)
    query = parse.parse_qs(parsed_url.query)
    path = parsed_url.path.lower()
    lowered = raw_html.lower()
    return (
        ("q" in query and path.endswith("/jobs"))
        or "searchondesktopserp" in parsed_url.query.lower()
        or "search results" in lowered
        or "ofertas de emprego" in lowered
    )


def _is_company_page(job_url: str) -> bool:
    return "/company/" in parse.urlparse(job_url).path.lower()


def _is_insufficient_job_content(workspace: AnalyzeJobRequest | ChatJobRequest | ParseJobRequest | object) -> bool:
    if hasattr(workspace, "workspace"):
        candidate = workspace.workspace
    else:
        candidate = workspace
    title = getattr(candidate, "title", "") or ""
    description = getattr(candidate, "job_description", "") or ""
    notes = getattr(candidate, "notes", "") or ""
    requirements = getattr(candidate, "extracted_requirements", []) or []
    combined = f"{title} {description} {notes}".lower()
    insufficient_markers = [
        "careers page",
        "search results page",
        "no job description available",
        "not directly extractable",
        "protected by javascript",
        "javascript rendering",
        "requires javascript",
        "authentication",
        "require authentication",
        "not fully available from the provided page content",
        "blocked",
        "open a specific role link",
    ]
    if any(marker in combined for marker in insufficient_markers):
        return True
    if not description.strip():
        return True
    if requirements == ["Communication", "Execution", "Product Thinking"]:
        return True
    return False


def _sanitize_notes_append(note_text: str | None, metadata_patch: JobMetadataPayload | None) -> str | None:
    if not note_text:
        return None

    cleaned = note_text
    if metadata_patch:
        replacements = [
            metadata_patch.contact_person and rf"(?:contact|recruiter)\s*:\s*{re.escape(metadata_patch.contact_person)}[.,]?\s*",
            metadata_patch.source and rf"source\s*:\s*{re.escape(metadata_patch.source)}[.,]?\s*",
            metadata_patch.application_date and rf"application date\s*:\s*{re.escape(metadata_patch.application_date)}[.,]?\s*",
            metadata_patch.follow_up_date and rf"follow[- ]?up date\s*:\s*{re.escape(metadata_patch.follow_up_date)}[.,]?\s*",
        ]
        for pattern in replacements:
            if pattern:
                cleaned = re.sub(pattern, "", cleaned, flags=re.I)

    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,.;\n")
    return cleaned or None


def _should_use_deterministic_chat(message: str) -> bool:
    lower = message.lower().strip()
    deterministic_patterns = [
        r"recruiter is ",
        r"(?:contact person|contact) is ",
        r"(?:change|set)\s+company",
        r"(?:change|set)\s+source",
        r"(?:change|set)\s+(?:job )?(?:title|position)",
        r"i applied today",
        r"applied (?:for )?(?:this job )?yesterday",
        r"follow up in \d+ day",
        r"follow up .*?(?:in|after) (?:a )?week",
        r"note[:\-]?",
    ]
    return any(re.search(pattern, lower) for pattern in deterministic_patterns)


def _attachment_summary(attachments: list[ChatAttachmentPayload]) -> list[str]:
    return [attachment.file_name for attachment in attachments]


def _anthropic_attachment_block(attachment: ChatAttachmentPayload) -> dict | None:
    media_type = attachment.media_type.lower()
    if media_type.startswith("image/"):
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": attachment.data_base64,
            },
        }

    if media_type == "application/pdf":
        return {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": attachment.data_base64,
            },
        }

    return None


def _looks_like_company_or_search_page(job_url: str) -> bool:
    parsed_url = parse.urlparse(job_url)
    path = parsed_url.path.lower()
    query = parsed_url.query.lower()
    return any(
        marker in path or marker in query
        for marker in ["/company/", "/search", "/jobs/search", "currentjobid=", "keywords="]
    )


def _compact_list(items: list[str], limit: int = 6) -> str:
    return ", ".join(items[:limit])


def _extract_json_payload(response_text: str) -> dict | None:
    candidates = [response_text.strip()]
    fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", response_text, re.S)
    if fenced_match:
        candidates.insert(0, fenced_match.group(1))

    brace_match = re.search(r"(\{.*\})", response_text, re.S)
    if brace_match:
        candidates.append(brace_match.group(1))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _extract_jobposting_schema(raw_html: str) -> dict | None:
    def iter_items(value: object) -> list[dict]:
        if isinstance(value, dict):
            items = [value]
            graph = value.get("@graph")
            if isinstance(graph, list):
                for item in graph:
                    items.extend(iter_items(item))
            return items
        if isinstance(value, list):
            items: list[dict] = []
            for item in value:
                items.extend(iter_items(item))
            return items
        return []

    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>\s*(.*?)\s*</script>',
        raw_html,
        re.I | re.S,
    ):
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        items = iter_items(parsed)
        for item in items:
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                return item
    return None


def _job_source_text(payload: ParseJobRequest) -> str:
    if payload.job_html:
        return payload.job_html.strip()

    fetched_text = _fetch_job_page_text(str(payload.job_url))
    if fetched_text:
        return fetched_text

    parsed_url = parse.urlparse(str(payload.job_url))
    path_tokens = [
        token
        for token in re.split(r"[-_/]+", parsed_url.path)
        if token and token not in {"jobs", "job", "careers", "search"}
    ]
    return " ".join(path_tokens) or str(payload.job_url)


def parse_job_fallback(payload: ParseJobRequest) -> ParseJobResponse:
    url = str(payload.job_url)
    parsed_url = parse.urlparse(url)
    source_host = _source_host(url)
    source_domain = _source_domain(url)
    host_parts = parsed_url.netloc.split(".")
    company = (
        "Unknown company"
        if source_domain in SOURCE_PLATFORMS
        else host_parts[-2].capitalize() if len(host_parts) >= 2 else "Unknown company"
    )

    path_tokens = [
        token
        for token in re.split(r"[-_/]+", parsed_url.path)
        if token and token not in {"jobs", "job", "careers", "search"}
    ]
    title = " ".join(token.capitalize() for token in path_tokens[:5]) or "Job opportunity"

    raw_html, _ = _fetch_url_content(url)
    blocked_page = _is_blocked_page(raw_html) if raw_html else False
    search_page = _is_search_results_page(url, raw_html) if raw_html else False
    company_page = _is_company_page(url)
    schema_data = _extract_jobposting_schema(raw_html) if raw_html else None
    html_title, html_company = _extract_title_company_from_html(raw_html, url) if raw_html else (None, None)
    job_listings = _extract_job_listings_from_html(raw_html) if raw_html else []
    schema_title = schema_data.get("title") if schema_data else None
    schema_company = (
        schema_data.get("hiringOrganization", {}).get("name")
        if schema_data and isinstance(schema_data.get("hiringOrganization"), dict)
        else None
    )
    if schema_company:
        company = _clean_company(schema_company)
    elif html_company:
        company = html_company
    elif _extract_domain_company(url):
        company = _extract_domain_company(url) or company

    raw_text = (
        payload.job_html.strip()
        if payload.job_html
        else schema_data.get("description", "")
        if schema_data and schema_data.get("description")
        else _strip_html(raw_html)
        if raw_html
        else _job_source_text(payload)
    )
    requirements = _infer_requirements(raw_text)
    description = raw_text or (
        f"Imported from {parsed_url.netloc}. Review the original listing to confirm salary, requirements, and responsibilities."
    )
    title = _clean_title(schema_title) if schema_title else html_title or _extract_title_from_url(url) or title

    if search_page:
        company = "Multiple companies"
        title = f"{source_domain.capitalize()} search results page"
        description = (
            f"This link points to a {source_domain.capitalize()} search results page, not a single job posting. "
            "Open the individual vacancy first for a reliable import of company, title, and requirements."
        )
        requirements = []
    elif blocked_page and source_domain == "indeed":
        company = "Unknown company"
        title = _extract_title_from_url(url) or "Indeed job page"
        description = (
            "Indeed blocked direct page extraction from this environment, so the exact employer and job details "
            "could not be verified. Open the specific job page directly or paste the visible job text for a cleaner import."
        )
        requirements = []
    elif company_page and company != "Unknown company":
        title = f"{company} careers page"
        listing_preview = _compact_list(job_listings, limit=5)
        description = (
            f"This looks like a company careers page rather than one specific vacancy. "
            f"{f'Visible openings include: {listing_preview}. ' if listing_preview else ''}"
            "Open a specific role link for a cleaner import."
        )
        requirements = _infer_requirements(f"{raw_text} {listing_preview}") if listing_preview else []
    elif blocked_page and source_domain == "wellfound":
        company = html_company or schema_company or company
        title = _extract_title_from_url(url) or "Wellfound job page"
        description = (
            "Wellfound blocked direct extraction from this environment, so only limited job information was available. "
            "If you open the exact job page text or paste the description here, the import will become much more accurate."
        )
        requirements = []

    if _looks_like_company_or_search_page(url) and job_listings and not schema_title and not search_page:
        title = f"{company} careers page"
        listing_preview = _compact_list(job_listings, limit=5)
        description = (
            f"This looks like a company careers or search page, not a single job post. "
            f"Visible roles include: {listing_preview}. Open a specific role link for a cleaner import."
        )
        requirements = _infer_requirements(f"{raw_text} {listing_preview}")

    if title.lower() == "unknown":
        title = "Job opportunity"

    return ParseJobResponse(
        company=company,
        title=title,
        link=url,
        job_description=description,
        extracted_requirements=requirements,
        metadata=JobMetadataPayload(source=source_host, notes_summary="Imported from job link."),
        parser_mode="fallback",
    )


def analyze_job_fallback(payload: AnalyzeJobRequest) -> AnalyzeJobResponse:
    workspace = payload.workspace
    profile = payload.profile
    if _is_insufficient_job_content(workspace):
        combined = f"{workspace.title} {workspace.job_description} {workspace.notes}".lower()
        strengths = ["Need more job detail"]
        missing = ["Specific job requirements unavailable"]
        summary = (
            "This link does not expose enough job-specific detail for a trustworthy fit score yet. "
            "Open a single vacancy page or paste the job description to get a real analysis."
        )

        if "search results page" in combined:
            strengths = ["Broad search context captured"]
            missing = ["Single vacancy details unavailable"]
            summary = (
                "This is a search results page, not one specific vacancy, so the fit score would be misleading. "
                "Open the exact posting you want to evaluate."
            )
        elif "careers page" in combined:
            strengths = ["Company context identified"]
            missing = ["Specific role requirements unavailable"]
            summary = (
                "This looks like a careers page rather than one concrete role, so the fit score is only provisional. "
                "Open an individual listing for a real analysis."
            )
        elif "authentication" in combined or "javascript" in combined or "blocked" in combined:
            strengths = ["Role title identified"]
            missing = ["Full job description unavailable"]
            summary = (
                "The job source hides most of the vacancy behind JavaScript or authentication, so this score is intentionally conservative. "
                "Paste the visible job description to get a better fit read."
            )

        analysis = JobAnalysisPayload(
            match_score=42,
            strengths=strengths,
            missing_skills=missing,
            seniority_fit="good fit",
            recommendation="consider",
            summary=summary,
        )
        metadata = payload.workspace.metadata or JobMetadataPayload()
        if not metadata.notes_summary:
            metadata.notes_summary = "Limited source data available. Open the exact vacancy for better analysis."
        return AnalyzeJobResponse(analysis=analysis, metadata=metadata, provider_mode="fallback")

    requirements = workspace.extracted_requirements or _infer_requirements(
        f"{workspace.title} {workspace.notes} {workspace.job_description}"
    )
    profile_terms = _collect_profile_terms(profile)

    direct_matches: list[str] = []
    transferable_matches: list[str] = []
    soft_matches: list[str] = []
    missing: list[str] = []

    for requirement in requirements:
        labels = _requirement_labels(requirement)
        best_match_kind = "missing"
        matched_labels: list[str] = []
        for label in labels:
            match_kind = _requirement_match_kind(label, profile_terms, profile)
            if match_kind == "direct":
                best_match_kind = "direct"
                matched_labels.append(label)
            elif match_kind == "transferable" and best_match_kind != "direct":
                best_match_kind = "transferable"
                matched_labels.append(label)
            elif match_kind == "soft" and best_match_kind not in {"direct", "transferable"}:
                best_match_kind = "soft"
                matched_labels.append(label)

        target_labels = matched_labels or labels[:1]
        if best_match_kind == "direct":
            for label in target_labels:
                if label not in direct_matches:
                    direct_matches.append(label)
        elif best_match_kind == "transferable":
            for label in target_labels:
                if label not in transferable_matches:
                    transferable_matches.append(label)
        elif best_match_kind == "soft":
            for label in target_labels:
                if label not in soft_matches:
                    soft_matches.append(label)
        else:
            for label in target_labels:
                if label not in missing:
                    missing.append(label)

    profile_role_families = _profile_role_families(profile)
    workspace_family = _workspace_role_family(workspace)
    strong_role_fit = workspace_family in profile_role_families if workspace_family else False

    seniority_fit = "good fit"
    if profile.years_of_experience <= 1 and re.search(r"senior|lead", workspace.title, re.I):
        seniority_fit = "too junior"
    elif profile.years_of_experience >= 6 and re.search(r"junior|intern", workspace.title, re.I):
        seniority_fit = "too senior"

    score = 30
    score += len(direct_matches) * 15
    score += len(transferable_matches) * 8
    score += len(soft_matches) * 3
    score += min(profile.years_of_experience * 3, 12)
    if strong_role_fit:
        score += 10
    if workspace_family == "full-stack" and profile_role_families & {"frontend", "backend"}:
        score += 5
    if seniority_fit == "good fit":
        score += 4
    score -= min(len(missing) * 4, 20)
    score = max(32, min(90, score))

    prioritized_strengths = _prioritize_match_labels(direct_matches + transferable_matches + soft_matches)

    recommendation = "skip"
    if seniority_fit == "too junior":
        recommendation = "skip"
    elif score >= 76:
        recommendation = "apply"
    elif score >= 55:
        recommendation = "consider"

    analysis = JobAnalysisPayload(
        match_score=score,
        strengths=prioritized_strengths[:4]
        or ["Transferable engineering foundation"],
        missing_skills=missing or ["No obvious critical gaps"],
        seniority_fit=seniority_fit,
        recommendation=recommendation,
        summary=_analysis_summary(
            recommendation,
            seniority_fit,
            direct_matches,
            transferable_matches,
            missing,
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
    workspace_patch = WorkspacePatchPayload()
    status_patch = None
    notes_append = None

    recruiter_match = re.search(r"recruiter is (.+)", message, re.I)
    if recruiter_match:
        recruiter = recruiter_match.group(1).strip()
        metadata_patch.contact_person = recruiter
        content = f"Saved. {recruiter} is now stored as the recruiter/contact person."
        return ChatJobResponse(
            assistant_message=_message("assistant", content),
            metadata_patch=metadata_patch,
            provider_mode="fallback",
        )

    contact_match = re.search(r"(?:contact person|contact) is (.+)", message, re.I)
    if contact_match:
        contact_name = contact_match.group(1).strip()
        metadata_patch.contact_person = contact_name
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                f"Saved. {contact_name} is now stored as the contact person for this application.",
            ),
            metadata_patch=metadata_patch,
            provider_mode="fallback",
        )

    company_match = re.search(r"(?:change|set)\s+company(?:\s+name)?\s+to\s+(.+)", message, re.I)
    if company_match:
        company_name = company_match.group(1).strip()
        workspace_patch.company = company_name
        return ChatJobResponse(
            assistant_message=_message("assistant", f"Saved. I updated the company name to {company_name}."),
            workspace_patch=workspace_patch,
            provider_mode="fallback",
        )

    title_match = re.search(r"(?:change|set)\s+(?:job )?(?:title|position(?: title)?)\s+to\s+(.+)", message, re.I)
    if title_match:
        title = title_match.group(1).strip()
        workspace_patch.title = title
        return ChatJobResponse(
            assistant_message=_message("assistant", f"Saved. I updated the position title to {title}."),
            workspace_patch=workspace_patch,
            provider_mode="fallback",
        )

    source_match = re.search(r"(?:change|set)\s+source\s+to\s+(.+)", message, re.I)
    if source_match:
        source = source_match.group(1).strip()
        metadata_patch.source = source
        return ChatJobResponse(
            assistant_message=_message("assistant", f"Saved. I updated the source to {source}."),
            metadata_patch=metadata_patch,
            provider_mode="fallback",
        )

    if "i applied today" in lower:
        metadata_patch.application_date = _today()
        status_patch = JobStatus.APPLIED
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                "Saved. I marked this role as applied and set the application date to today.",
            ),
            metadata_patch=metadata_patch,
            status_patch=status_patch,
            provider_mode="fallback",
        )

    if re.search(r"applied (?:for )?(?:this job )?yesterday", lower):
        metadata_patch.application_date = (_now() - timedelta(days=1)).date().isoformat()
        status_patch = JobStatus.APPLIED
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                "Saved. I marked this role as applied and set the application date to yesterday.",
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
            assistant_message=_message(
                "assistant",
                f"Done. I set the follow-up date to {_format_date(metadata_patch.follow_up_date)}.",
            ),
            metadata_patch=metadata_patch,
            provider_mode="fallback",
        )

    if re.search(r"follow up .*?(?:in|after) (?:a )?week", lower):
        metadata_patch.follow_up_date = _days_from_now(7)
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                f"Done. I set the follow-up date to {_format_date(metadata_patch.follow_up_date)}.",
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
            assistant_message=_message(
                "assistant",
                "Saved. I added that note to the workspace summary and notes.",
            ),
            metadata_patch=metadata_patch,
            notes_append=notes_append,
            provider_mode="fallback",
        )

    if "what can you do" in lower or "how can you help" in lower:
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                "I can summarize the role, explain key requirements, tell you whether this looks worth applying to, update structured fields like recruiter or follow-up date, and suggest what to ask the recruiter next.",
            ),
            provider_mode="fallback",
        )

    if "summarize" in lower and "role" in lower:
        return ChatJobResponse(
            assistant_message=_message("assistant", _job_summary_text(payload.workspace)),
            provider_mode="fallback",
        )

    if "requirement" in lower or "requirements" in lower:
        requirements = _job_requirements_preview(payload.workspace)
        preview = ", ".join(requirements[:8]) if requirements else "No clear requirements extracted yet."
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                f"The main requirements I can see right now are: {preview}. Run analysis for a fuller fit breakdown.",
            ),
            provider_mode="fallback",
        )

    analysis = payload.workspace.analysis
    if "should i apply" in lower or "worth applying" in lower:
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                _should_apply_response(payload.workspace, analysis),
            ),
            provider_mode="fallback",
        )

    if "what should i ask" in lower and "recruiter" in lower:
        return ChatJobResponse(
            assistant_message=_message(
                "assistant",
                _recruiter_questions(payload.workspace, analysis),
            ),
            provider_mode="fallback",
        )

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
        assistant_message=_message("assistant", content),
        provider_mode="fallback",
    )


def _anthropic_request(system_prompt: str, user_prompt: str | list[dict]) -> str | None:
    if not settings.anthropic_api_key:
        return None

    models_to_try = [settings.anthropic_model, *MODEL_FALLBACKS]
    seen_models: set[str] = set()
    for model_name in models_to_try:
        if not model_name or model_name in seen_models:
            continue
        seen_models.add(model_name)
        payload = {
            "model": model_name,
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
            continue

        content = raw.get("content", [])
        if not content:
            continue
        text_parts = [part.get("text", "") for part in content if part.get("type") == "text"]
        text = "\n".join(text_parts).strip()
        if text:
            return text
    return None


def profile_import_with_optional_llm(payload: ProfileImportRequest) -> ProfileImportResponse:
    fallback_profile = payload.profile.model_copy(deep=True)
    if payload.github_url and not fallback_profile.github_url:
        fallback_profile.github_url = str(payload.github_url)

    github_text = ""
    if payload.github_url:
        raw_html, _ = _fetch_url_content(str(payload.github_url))
        github_text = _strip_html(raw_html)[:12000] if raw_html else ""

    attachment_blocks = [
        block
        for attachment in payload.attachments
        if (block := _anthropic_attachment_block(attachment)) is not None
    ]
    attachment_names = ", ".join(_attachment_summary(payload.attachments)) or "none"
    user_content: str | list[dict]
    if attachment_blocks:
        user_content = [
            {
                "type": "text",
                "text": (
                    "Current candidate profile JSON:\n"
                    f"{json.dumps(payload.profile.model_dump(mode='json'), ensure_ascii=False)}\n\n"
                    f"GitHub URL: {payload.github_url or 'not provided'}\n"
                    f"GitHub page text:\n{github_text or 'No GitHub page text available.'}\n\n"
                    f"Attached CV / screenshots: {attachment_names}\n"
                    "Use the attachments and GitHub page to enrich the candidate profile."
                ),
            },
            *attachment_blocks,
        ]
    else:
        user_content = (
            "Current candidate profile JSON:\n"
            f"{json.dumps(payload.profile.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            f"GitHub URL: {payload.github_url or 'not provided'}\n"
            f"GitHub page text:\n{github_text or 'No GitHub page text available.'}\n"
        )

    response_text = _anthropic_request(
        system_prompt=(
            "You extract and enrich one candidate profile from a CV, screenshots, and optionally a GitHub page. "
            "Return valid JSON only with keys profile and summary. "
            "profile must include headline, summary, preferred_roles, target_seniority, tech_stack, skills, "
            "years_of_experience, english_level, location, preferred_locations, work_format, open_to_relocate, "
            "salary_expectation, github_url, portfolio_url. "
            "skills must be an array of objects with name, level, years. "
            "Only include facts supported by the attachments, GitHub page, or the current profile. "
            "Do not invent employers, salaries, locations, or experience. "
            "If a field is unknown, preserve the current value or leave it empty. "
            "Keep the profile summary concise and recruiter-friendly."
        ),
        user_prompt=user_content,
    )
    if not response_text:
        return ProfileImportResponse(
            profile=fallback_profile,
            summary="AI could not enrich the profile right now. Your existing profile draft is still available.",
            provider_mode="fallback",
        )

    parsed = _extract_json_payload(response_text)
    if not parsed:
        return ProfileImportResponse(
            profile=fallback_profile,
            summary="AI returned an unreadable profile payload, so the existing draft was preserved.",
            provider_mode="fallback",
        )

    try:
        profile_payload = parsed.get("profile") or {}
        merged_profile = fallback_profile.model_dump(mode="json")
        merged_profile.update({key: value for key, value in profile_payload.items() if value is not None})
        if payload.github_url and not merged_profile.get("github_url"):
            merged_profile["github_url"] = str(payload.github_url)
        profile = UserProfilePayload(**merged_profile)
    except (TypeError, ValueError):
        return ProfileImportResponse(
            profile=fallback_profile,
            summary="AI enrichment failed validation, so the existing profile draft was preserved.",
            provider_mode="fallback",
        )

    return ProfileImportResponse(
        profile=profile,
        summary=parsed.get("summary") or "AI enriched the profile draft. Review the fields and save any changes you want to keep.",
        provider_mode="llm",
    )


def parse_job_with_optional_llm(payload: ParseJobRequest) -> ParseJobResponse:
    fallback = parse_job_fallback(payload)
    raw_html, _ = _fetch_url_content(str(payload.job_url))
    if raw_html and _is_blocked_page(raw_html) and not payload.job_html:
        return fallback
    source_text = _job_source_text(payload)
    response_text = _anthropic_request(
        system_prompt=(
            "Extract structured job data from the provided page content. "
            "Return valid JSON only with keys company, title, job_description, extracted_requirements. "
            "Be precise and concise. Use the actual employer and actual role title from the page. "
            "If the source is a blocked page, search results page, or company page without one specific vacancy, "
            "do not use the platform name as the company unless the employer is truly unknown. "
            "If the URL is a company careers page or listing page rather than a single vacancy, set title to "
            "'<Company> careers page' and summarize the visible openings in job_description. "
            "Do not invent missing facts."
        ),
        user_prompt=(
            f"Job URL: {payload.job_url}\n"
            f"Heuristic company: {fallback.company}\n"
            f"Heuristic title: {fallback.title}\n"
            f"Job HTML/Text:\n{source_text}"
        ),
    )
    if not response_text:
        return fallback

    parsed = _extract_json_payload(response_text)
    if not parsed:
        return fallback

    company = parsed.get("company") or fallback.company
    title = parsed.get("title") or fallback.title
    if (
        company
        and _normalize(company) == _normalize(_source_domain(str(payload.job_url)))
        and fallback.company != company
    ):
        company = fallback.company
    if company and _normalize(company) in {"unknown", "unknown company"}:
        company = fallback.company if fallback.company not in {"Unknown", "Unknown company"} else "Unknown company"
    if title and _normalize(title) in {"unknown", "job opportunity"}:
        title = fallback.title

    return ParseJobResponse(
        company=company,
        title=title,
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
            "Compare a candidate profile against one job workspace. Return valid JSON only with "
            "match_score, strengths, missing_skills, seniority_fit, recommendation, summary. "
            "Be nuanced, not overly harsh. Score based on core must-have overlap, seniority, years of experience, "
            "and transferable skills. Do not penalize every missing keyword equally. "
            "Do not list requirements as missing if the candidate already clearly meets them through skills, years of experience, "
            "English level, work format, or equivalent stack. "
            "missing_skills must be short phrases only, never long copied requirement bullets or full sentences. "
            "strengths must also be short phrases, max 5 items. "
            "If the job data is incomplete, blocked, or clearly from a search/careers page, say that directly in the summary, "
            "keep the score conservative, and do not hallucinate missing requirements. "
            "Keep strengths and missing_skills concrete and short. Keep summary to one or two sentences."
        ),
        user_prompt=json.dumps(payload.model_dump(mode="json"), ensure_ascii=False),
    )
    if not response_text:
        return fallback

    try:
        parsed = _extract_json_payload(response_text)
        if not parsed:
            return fallback
        analysis = JobAnalysisPayload(**parsed)
    except (TypeError, ValueError):
        return fallback

    return AnalyzeJobResponse(
        analysis=analysis,
        metadata=fallback.metadata,
        provider_mode="llm",
    )


def chat_job_with_optional_llm(payload: ChatJobRequest) -> ChatJobResponse:
    fallback = chat_job_fallback(payload)
    if _should_use_deterministic_chat(payload.message) and not payload.attachments:
        return fallback
    attachment_blocks = [
        block
        for attachment in payload.attachments
        if (block := _anthropic_attachment_block(attachment)) is not None
    ]
    user_content: str | list[dict]
    if attachment_blocks:
        attachment_names = ", ".join(_attachment_summary(payload.attachments))
        workspace_payload = payload.model_dump(mode="json", exclude={"attachments"})
        user_content = [
            {
                "type": "text",
                "text": (
                    f"User message: {payload.message}\n"
                    f"Attachments: {attachment_names}\n"
                    f"Workspace context JSON:\n{json.dumps(workspace_payload, ensure_ascii=False)}"
                ),
            },
            *attachment_blocks,
        ]
    else:
        user_content = json.dumps(payload.model_dump(mode="json"), ensure_ascii=False)
    response_text = _anthropic_request(
        system_prompt=(
            "You are a job-specific assistant for one job workspace. "
            "Always answer naturally, helpfully, and concisely. "
            "Prefer plain text in a short paragraph or 3-5 short bullets. "
            "Avoid markdown headings, tables, bold formatting, and emoji unless the user asks. "
            "When the user asks about requirements, skills, fit, or next steps, answer directly from the workspace data. "
            "You should also be useful for questions like whether to apply, how to summarize the role, and what to ask the recruiter. "
            "If the user attached screenshots or PDFs, inspect them and use them to recover missing job details when possible. "
            "If the user also updates structured data like recruiter, application date, follow-up date, notes, or status, "
            "put recruiter/contact, source, dates, and summary fields into metadata_patch. "
            "Put company, title, job_description, and extracted_requirements corrections into workspace_patch. "
            "Use notes_append only for genuinely new freeform notes that are not duplicates of structured fields. "
            "return valid JSON only with keys assistant_message, metadata_patch, workspace_patch, notes_append, status_patch. "
            "If the user is only asking a normal question, return a plain natural-language answer and do not force JSON."
        ),
        user_prompt=user_content,
    )
    if not response_text:
        if payload.attachments:
            attachment_names = ", ".join(_attachment_summary(payload.attachments))
            return ChatJobResponse(
                assistant_message=_message(
                    "assistant",
                    f"I couldn't inspect the attached file(s) right now: {attachment_names}. Try again in live AI mode, or paste the most important text from the file here.",
                ),
                provider_mode="fallback",
            )
        return fallback

    parsed = _extract_json_payload(response_text)
    if not parsed:
        return ChatJobResponse(
            assistant_message=_message("assistant", response_text.strip()),
            provider_mode="llm",
        )

    try:
        assistant_content = parsed.get("assistant_message") or fallback.assistant_message.content
        metadata_patch = (
            JobMetadataPayload(**parsed["metadata_patch"]) if parsed.get("metadata_patch") else None
        )
        workspace_patch = (
            WorkspacePatchPayload(**parsed["workspace_patch"]) if parsed.get("workspace_patch") else None
        )
        return ChatJobResponse(
            assistant_message=_message("assistant", assistant_content),
            metadata_patch=metadata_patch,
            workspace_patch=workspace_patch,
            notes_append=_sanitize_notes_append(parsed.get("notes_append"), metadata_patch),
            status_patch=parsed.get("status_patch"),
            provider_mode="llm",
        )
    except (TypeError, ValueError):
        return fallback
