from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.auth import AuthResponse, UserLogin, UserRegister
from app.services.auth import login_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: UserRegister, db: DbSession) -> AuthResponse:
    return register_user(db, payload)


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: DbSession) -> AuthResponse:
    return login_user(db, payload)

