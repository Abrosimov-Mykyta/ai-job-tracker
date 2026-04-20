from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services.auth import get_current_user


DbSession = Annotated[Session, Depends(get_db)]


def require_user(
    db: DbSession, authorization: Annotated[str | None, Header()] = None
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing.",
        )
    token = authorization.replace("Bearer ", "", 1)
    return get_current_user(db, token)


CurrentUser = Annotated[User, Depends(require_user)]

