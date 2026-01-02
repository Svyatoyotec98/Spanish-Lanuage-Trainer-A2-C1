from sqlalchemy.orm import Session
from .db import SessionLocal
import app.models_db as models_db

from datetime import datetime, timedelta
from typing import Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from .models import UserCreate, UserPublic, LoginRequest, Token

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ВАЖНО: потом вынесем в переменные окружения. Сейчас так проще.
SECRET_KEY = "CHANGE_ME_TO_A_LONG_RANDOM_STRING"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 дней

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
security = HTTPBearer()



def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _create_access_token(subject_email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject_email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)




def register_user(payload: UserCreate, db: Session) -> UserPublic:
    email = payload.email.lower().strip()

    existing_user = db.query(models_db.User).filter(
        models_db.User.email == email
    ).first()

    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    db_user = models_db.User(
        email=email,
        hashed_password=_hash_password(payload.password)
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return UserPublic(id=db_user.id, email=db_user.email)



def login(payload: LoginRequest, db: Session) -> Token:
    email = payload.email.lower().strip()

    db_user = db.query(models_db.User).filter(
        models_db.User.email == email
    ).first()

    if not db_user or not _verify_password(payload.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = _create_access_token(email)
    return Token(access_token=token)



def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> UserPublic:
    token = creds.credentials
    try:
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = decoded.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")

        db_user = db.query(models_db.User).filter(
            models_db.User.email == email
        ).first()

        if not db_user:
            raise HTTPException(status_code=401, detail="User not found")

        return UserPublic(id=db_user.id, email=db_user.email)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

