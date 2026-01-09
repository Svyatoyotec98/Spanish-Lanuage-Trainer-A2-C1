import json
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from . import models_db

from .models import UserCreate, LoginRequest, Token, UserPublic
from .auth import register_user, login, get_current_user, get_db

app = FastAPI(title="Spanish Trainer API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разрешаем все origins для разработки (localhost + IP)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


# ═══════════════════════════════════════════════════════════════
# PROGRESS ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/progress")
def get_progress(current_user: UserPublic = Depends(get_current_user), db=Depends(get_db)):
    """Получить прогресс пользователя"""
    user_progress = db.query(models_db.UserProgress).filter(
        models_db.UserProgress.user_id == current_user.id
    ).first()

    if not user_progress:
        return {}

    return json.loads(user_progress.progress_data)


@app.post("/progress")
def save_progress(payload: dict, current_user: UserPublic = Depends(get_current_user), db=Depends(get_db)):
    """Сохранить прогресс пользователя"""
    user_progress = db.query(models_db.UserProgress).filter(
        models_db.UserProgress.user_id == current_user.id
    ).first()

    if user_progress:
        user_progress.progress_data = json.dumps(payload)
    else:
        user_progress = models_db.UserProgress(
            user_id=current_user.id,
            progress_data=json.dumps(payload)
        )
        db.add(user_progress)

    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# NAVIGATION STATE ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/navigation-state")
def get_navigation(current_user: UserPublic = Depends(get_current_user), db=Depends(get_db)):
    """Получить состояние навигации пользователя"""
    user_nav = db.query(models_db.UserNavigation).filter(
        models_db.UserNavigation.user_id == current_user.id
    ).first()

    if not user_nav:
        return {}

    return json.loads(user_nav.navigation_data)


@app.post("/navigation-state")
def save_navigation(payload: dict, current_user: UserPublic = Depends(get_current_user), db=Depends(get_db)):
    """Сохранить состояние навигации пользователя"""
    user_nav = db.query(models_db.UserNavigation).filter(
        models_db.UserNavigation.user_id == current_user.id
    ).first()

    if user_nav:
        user_nav.navigation_data = json.dumps(payload)
    else:
        user_nav = models_db.UserNavigation(
            user_id=current_user.id,
            navigation_data=json.dumps(payload)
        )
        db.add(user_nav)

    db.commit()
    return {"ok": True}
