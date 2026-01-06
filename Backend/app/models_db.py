from sqlalchemy import Column, Integer, String, ForeignKey, Text
from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)


class UserProgress(Base):
    __tablename__ = "user_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    progress_data = Column(Text, nullable=False, default="{}")  # JSON строка с прогрессом


class UserNavigation(Base):
    __tablename__ = "user_navigation"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    navigation_data = Column(Text, nullable=False, default="{}")  # JSON строка с навигацией
