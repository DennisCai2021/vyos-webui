"""User models"""
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user model"""

    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr | None = None
    full_name: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    """User creation model"""

    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    """User update model"""

    email: EmailStr | None = None
    full_name: str | None = None
    is_active: bool | None = None


class User(UserBase):
    """User model"""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
