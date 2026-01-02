from fastapi import FastAPI, Depends
from .db import Base, engine
from . import models_db

from .models import UserCreate, LoginRequest, Token, UserPublic
from .auth import register_user, login, get_current_user, get_db

app = FastAPI(title="Spanish Trainer API")
Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/auth/register", response_model=UserPublic)
def auth_register(payload: UserCreate, db=Depends(get_db)):
    return register_user(payload, db)


@app.post("/auth/login", response_model=Token)
def auth_login(payload: LoginRequest, db=Depends(get_db)):
    return login(payload, db)



@app.get("/me", response_model=UserPublic)
def me(current_user: UserPublic = Depends(get_current_user)):
    return current_user
