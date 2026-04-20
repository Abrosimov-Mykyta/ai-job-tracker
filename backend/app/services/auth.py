from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import secrets

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User
from app.schemas.auth import AuthResponse, AuthUser, UserLogin, UserRegister

settings = get_settings()


def hash_password(password: str, salt: str | None = None) -> str:
    effective_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), effective_salt.encode("utf-8"), 100_000
    )
    return f"{effective_salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    salt, expected_hash = stored_hash.split("$", maxsplit=1)
    computed_hash = hash_password(password, salt).split("$", maxsplit=1)[1]
    return hmac.compare_digest(computed_hash, expected_hash)


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def register_user(db: Session, payload: UserRegister) -> AuthResponse:
    existing_user = db.scalar(select(User).where(User.email == payload.email))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return AuthResponse(
        access_token=token,
        user=AuthUser(id=user.id, full_name=user.full_name, email=user.email),
    )


def login_user(db: Session, payload: UserLogin) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = create_access_token(user.id)
    return AuthResponse(
        access_token=token,
        user=AuthUser(id=user.id, full_name=user.full_name, email=user.email),
    )


def get_current_user(db: Session, token: str) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        ) from None

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    return user

