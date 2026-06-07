from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    city = Column(String(100), nullable=True)
    state = Column(String(2), nullable=True)
    plan = Column(String(50), default="basic")  # basic | pro | enterprise
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    # Primary & Organization
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)

    # Identity
    name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    phone = Column(String(20), nullable=True)
    bio = Column(String(500), nullable=True)
    profile_picture_url = Column(String(500), nullable=True)

    # Authentication
    password_hash = Column(String(255), nullable=False)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)

    # Role & Permissions
    role = Column(String(20), default="secretary")
    # superadmin | admin | doctor | secretary
    is_verified = Column(Boolean, default=False)
    is_two_fa_enabled = Column(Boolean, default=False)
    two_fa_secret = Column(String(255), nullable=True)

    # Preferences
    language = Column(String(5), default="pt-BR")  # pt-BR, en-US, es-ES
    theme = Column(String(10), default="light")  # light | dark | auto
    timezone = Column(String(50), default="America/Sao_Paulo")
    currency = Column(String(3), default="BRL")

    # Account Status
    active = Column(Boolean, default=True)
    is_suspended = Column(Boolean, default=False)
    suspension_reason = Column(String(500), nullable=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6

    # Relationships
    organization = relationship("Organization", back_populates="users")
    user_sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    user_preferences = relationship("UserPreferences", back_populates="user", cascade="all, delete-orphan", uselist=False)
    user_settings = relationship("UserSettings", back_populates="user", cascade="all, delete-orphan", uselist=False)
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")
    login_history = relationship("LoginHistory", back_populates="user", cascade="all, delete-orphan")
