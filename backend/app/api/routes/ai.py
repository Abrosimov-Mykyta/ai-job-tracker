from fastapi import APIRouter

from app.schemas.ai import (
    AnalyzeJobRequest,
    AnalyzeJobResponse,
    ChatJobRequest,
    ChatJobResponse,
    ParseJobRequest,
    ParseJobResponse,
)
from app.services.ai import (
    analyze_job_with_optional_llm,
    chat_job_with_optional_llm,
    parse_job_with_optional_llm,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/parse", response_model=ParseJobResponse)
def parse_job(payload: ParseJobRequest) -> ParseJobResponse:
    return parse_job_with_optional_llm(payload)


@router.post("/analyze", response_model=AnalyzeJobResponse)
def analyze_job(payload: AnalyzeJobRequest) -> AnalyzeJobResponse:
    return analyze_job_with_optional_llm(payload)


@router.post("/chat", response_model=ChatJobResponse)
def chat_job(payload: ChatJobRequest) -> ChatJobResponse:
    return chat_job_with_optional_llm(payload)
