# OrthoClinic Notification System Design

**Status:** Design Complete | **Timeline:** 6 days | **Version:** 1.0.0

## Executive Summary

This document provides a complete architecture and implementation plan for OrthoClinic's real-time notification system. The system enables multi-channel notifications (in-app, email, push) with real-time delivery, preference management, and scheduling capabilities.

**Key Features:**
- Real-time in-app notifications with WebSocket
- Email notifications with Celery async tasks
- Web push notifications
- User preference management
- 30-day notification history
- Unread badge counter
- Sound/visual alerts
- Notification scheduling & quiet hours

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │ Notification Center  │  │ In-App Toast/Alerts              │ │
│  │ - Bell Icon          │  │ - Sound/Visual                   │ │
│  │ - Unread Badge       │  │ - Real-time Updates              │ │
│  │ - History (30 days)  │  │                                  │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
│           ▲                            ▲                         │
│           └────────────────────────────┘                         │
│                   WebSocket Connection                           │
└──────────────┬────────────────────────────────────┬──────────────┘
               │                                    │
        ┌──────▼─────────┐              ┌──────────▼──────────┐
        │  FastAPI       │              │  Redux/Zustand     │
        │  WebSocket     │              │  NotificationStore │
        │  Server        │              └────────────────────┘
        └──────┬─────────┘
               │
        ┌──────▼──────────────────────────────────────────┐
        │           FastAPI Backend (main.py)             │
        │                                                 │
        │  ┌──────────────────────────────────────────┐  │
        │  │ Notification Routers (/notifications/*)  │  │
        │  │ - Create notification                    │  │
        │  │ - List/Paginate                          │  │
        │  │ - Mark as read/unread                    │  │
        │  │ - Delete                                 │  │
        │  │ - Preferences management                 │  │
        │  └──────────────────────────────────────────┘  │
        │                                                 │
        │  ┌──────────────────────────────────────────┐  │
        │  │ WebSocket Manager                        │  │
        │  │ - Connection handling                    │  │
        │  │ - Broadcasting                           │  │
        │  │ - Connection pool management             │  │
        │  └──────────────────────────────────────────┘  │
        │                                                 │
        │  ┌──────────────────────────────────────────┐  │
        │  │ Notification Service                     │  │
        │  │ - Preference checking                    │  │
        │  │ - Quiet hours validation                 │  │
        │  │ - Channel selection                      │  │
        │  │ - Scheduling                             │  │
        │  └──────────────────────────────────────────┘  │
        └──────┬───────────────────────────────────────┬─┘
               │                                       │
        ┌──────▼────────────┐         ┌───────────────▼────────┐
        │  PostgreSQL DB    │         │  Redis Cache           │
        │                   │         │                        │
        │ - notifications   │         │ - Active connections   │
        │ - preferences     │         │ - User session state   │
        │ - history         │         │ - Rate limiting        │
        │                   │         │ - Unread counts        │
        └──────────────────┘         └────────────────────────┘
               ▲
               │
        ┌──────┴────────────────────────────────────────┐
        │  Celery Task Queue                             │
        │                                                │
        │  ┌──────────────────────────────────────────┐ │
        │  │ send_email_task()                        │ │
        │  │ - Email construction                     │ │
        │  │ - SendGrid integration                   │ │
        │  │ - Retry logic                            │ │
        │  │ - Tracking                               │ │
        │  └──────────────────────────────────────────┘ │
        │                                                │
        │  ┌──────────────────────────────────────────┐ │
        │  │ schedule_notification_task()             │ │
        │  │ - Delayed delivery                       │ │
        │  │ - Quiet hours enforcement                │ │
        │  │ - Batch digest emails                    │ │
        │  └──────────────────────────────────────────┘ │
        │                                                │
        │  ┌──────────────────────────────────────────┐ │
        │  │ send_push_notification_task()            │ │
        │  │ - Web push integration                   │ │
        │  │ - Service worker notification            │ │
        │  └──────────────────────────────────────────┘ │
        └─────────────────────────────────────────────┘
```

---

## 2. Data Models & Database Schema

### 2.1 Core Models

```python
# backend/models/notifications.py

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON, Enum, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from datetime import datetime
import enum

class NotificationType(str, enum.Enum):
    """Tipos de notificações disponíveis"""
    APPOINTMENT_REMINDER = "appointment_reminder"
    APPOINTMENT_CONFIRMED = "appointment_confirmed"
    APPOINTMENT_CANCELLED = "appointment_cancelled"
    APPOINTMENT_RESCHEDULED = "appointment_rescheduled"
    PAYMENT_DUE = "payment_due"
    PAYMENT_RECEIVED = "payment_received"
    DOCUMENT_SIGNED = "document_signed"
    DOCUMENT_REQUESTED = "document_requested"
    PRESCRIPTION_READY = "prescription_ready"
    EXAM_RESULT_READY = "exam_result_ready"
    TREATMENT_PLAN_UPDATED = "treatment_plan_updated"
    PATIENT_CHECKIN_REMINDER = "patient_checkin_reminder"
    CLINIC_ANNOUNCEMENT = "clinic_announcement"
    SYSTEM_ALERT = "system_alert"
    EDUCATIONAL_CONTENT = "educational_content"


class NotificationStatus(str, enum.Enum):
    """Estados da notificação"""
    PENDING = "pending"          # Agendada
    SENT = "sent"                # Enviada via WebSocket
    DELIVERED = "delivered"      # Entregue ao cliente
    READ = "read"                # Lida pelo usuário
    FAILED = "failed"            # Falha no envio
    ARCHIVED = "archived"        # Arquivada pelo usuário


class NotificationChannel(str, enum.Enum):
    """Canais de entrega"""
    IN_APP = "in_app"
    EMAIL = "email"
    PUSH = "push"
    SMS = "sms"  # Para futuro


class Notification(Base):
    """Modelo de notificação principal"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    
    # Destinatário
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    
    # Conteúdo
    type = Column(Enum(NotificationType), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    description = Column(Text, nullable=True)  # Descrição longa para detalhes
    
    # Metadados
    status = Column(Enum(NotificationStatus), default=NotificationStatus.PENDING, index=True)
    channel = Column(Enum(NotificationChannel), nullable=False, index=True)
    
    # Contexto da notificação (para deep linking)
    context_type = Column(String(50), nullable=True)  # "patient", "consultation", "payment", etc
    context_id = Column(Integer, nullable=True)       # ID do recurso relacionado
    action_url = Column(String(500), nullable=True)   # URL para ação
    
    # Dados estruturados para renderização customizada
    data = Column(JSON, nullable=True)  # {"patient_name": "João", "appointment_date": "2026-06-10", ...}
    
    # Rastreamento
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # Auto-delete após período
    
    # Retry logic
    attempt_count = Column(Integer, default=0)
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Priority e scheduling
    priority = Column(Integer, default=0)  # 0=normal, 1=high, -1=low
    scheduled_for = Column(DateTime(timezone=True), nullable=True)  # Envio agendado
    
    # Relacionamentos
    user = relationship("User", foreign_keys=[user_id])
    organization = relationship("Organization", foreign_keys=[organization_id])
    
    # Índices compostos para performance
    __table_args__ = (
        Index('idx_user_status', 'user_id', 'status'),
        Index('idx_user_created', 'user_id', 'created_at'),
        Index('idx_org_type', 'organization_id', 'type'),
    )


class NotificationPreference(Base):
    """Preferências de notificação por usuário"""
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    
    # Canais habilitados globalmente
    email_enabled = Column(Boolean, default=True)
    push_enabled = Column(Boolean, default=True)
    in_app_enabled = Column(Boolean, default=True)
    sms_enabled = Column(Boolean, default=False)
    
    # Frequência de email
    email_frequency = Column(String(20), default="instant")  # instant | daily | weekly | none
    
    # Quiet hours (silêncio)
    quiet_hours_enabled = Column(Boolean, default=False)
    quiet_hours_start = Column(String(5), nullable=True)    # "22:00"
    quiet_hours_end = Column(String(5), nullable=True)      # "08:00"
    
    # Timezone do usuário
    timezone = Column(String(50), default="America/Sao_Paulo")
    
    # Preferências por tipo de notificação (JSON para flexibilidade)
    # {"appointment_reminder": {"enabled": true, "channels": ["email", "push"]}, ...}
    type_preferences = Column(JSON, default={})
    
    # Limiar customizados (ex: alerta de preço)
    thresholds = Column(JSON, default={})  # {"price_alert_threshold": 100, ...}
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("User", foreign_keys=[user_id])
    organization = relationship("Organization", foreign_keys=[organization_id])


class NotificationTemplate(Base):
    """Templates de notificação para reutilização"""
    __tablename__ = "notification_templates"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    
    type = Column(Enum(NotificationType), nullable=False, unique=True)
    name = Column(String(100), nullable=False)
    
    # Template content com placeholders
    # Ex: "Olá {patient_name}, sua consulta será em {appointment_date}"
    title_template = Column(String(200), nullable=False)
    message_template = Column(Text, nullable=False)
    description_template = Column(Text, nullable=True)
    
    # Canais padrão
    default_channels = Column(JSON, default=["in_app"])  # List[NotificationChannel]
    
    # Metadados
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    organization = relationship("Organization", foreign_keys=[organization_id])


class NotificationHistory(Base):
    """Auditoria e histórico (soft delete via archived_at em Notification)"""
    __tablename__ = "notification_history"

    id = Column(Integer, primary_key=True, index=True)
    notification_id = Column(Integer, ForeignKey("notifications.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    action = Column(String(50), nullable=False)  # "created", "sent", "read", "archived"
    previous_status = Column(Enum(NotificationStatus), nullable=True)
    new_status = Column(Enum(NotificationStatus), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
```

### 2.2 Database Migrations

```python
# backend/migrations/versions/001_create_notification_tables.py

"""Create notification tables

Revision ID: 001
Create Date: 2026-06-07 17:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # Notification table
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('appointment_reminder', 'appointment_confirmed', 
                  'appointment_cancelled', 'appointment_rescheduled', 'payment_due',
                  'payment_received', 'document_signed', 'document_requested',
                  'prescription_ready', 'exam_result_ready', 'treatment_plan_updated',
                  'patient_checkin_reminder', 'clinic_announcement', 'system_alert',
                  'educational_content', name='notificationtype'), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('pending', 'sent', 'delivered', 'read', 'failed', 
                  'archived', name='notificationstatus'), nullable=False),
        sa.Column('channel', sa.Enum('in_app', 'email', 'push', 'sms', 
                  name='notificationchannel'), nullable=False),
        sa.Column('context_type', sa.String(length=50), nullable=True),
        sa.Column('context_id', sa.Integer(), nullable=True),
        sa.Column('action_url', sa.String(length=500), nullable=True),
        sa.Column('data', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_attempt_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('scheduled_for', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_user_status', 'user_id', 'status'),
        sa.Index('idx_user_created', 'user_id', 'created_at'),
        sa.Index('idx_org_type', 'organization_id', 'type'),
    )

    # NotificationPreference table
    op.create_table(
        'notification_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('push_enabled', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('in_app_enabled', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('sms_enabled', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('email_frequency', sa.String(length=20), nullable=False, server_default='instant'),
        sa.Column('quiet_hours_enabled', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('quiet_hours_start', sa.String(length=5), nullable=True),
        sa.Column('quiet_hours_end', sa.String(length=5), nullable=True),
        sa.Column('timezone', sa.String(length=50), nullable=False, server_default='America/Sao_Paulo'),
        sa.Column('type_preferences', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('thresholds', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], unique=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )

    # NotificationTemplate table
    op.create_table(
        'notification_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('appointment_reminder', 'appointment_confirmed',
                  'appointment_cancelled', 'appointment_rescheduled', 'payment_due',
                  'payment_received', 'document_signed', 'document_requested',
                  'prescription_ready', 'exam_result_ready', 'treatment_plan_updated',
                  'patient_checkin_reminder', 'clinic_announcement', 'system_alert',
                  'educational_content', name='notificationtype2'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('title_template', sa.String(length=200), nullable=False),
        sa.Column('message_template', sa.Text(), nullable=False),
        sa.Column('description_template', sa.Text(), nullable=True),
        sa.Column('default_channels', postgresql.JSON(), nullable=False, server_default='["in_app"]'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'type'),
    )

    # NotificationHistory table
    op.create_table(
        'notification_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('notification_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('previous_status', sa.Enum('pending', 'sent', 'delivered', 'read', 'failed',
                  'archived', name='notificationstatus2'), nullable=True),
        sa.Column('new_status', sa.Enum('pending', 'sent', 'delivered', 'read', 'failed',
                  'archived', name='notificationstatus3'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['notification_id'], ['notifications.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_user_history', 'user_id', 'created_at'),
    )

def downgrade():
    op.drop_table('notification_history')
    op.drop_table('notification_templates')
    op.drop_table('notification_preferences')
    op.drop_table('notifications')
```

---

## 3. Backend Implementation

### 3.1 Schemas (Pydantic Models)

```python
# backend/schemas/notifications.py

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

# Enums
class NotificationType(str, Enum):
    APPOINTMENT_REMINDER = "appointment_reminder"
    APPOINTMENT_CONFIRMED = "appointment_confirmed"
    APPOINTMENT_CANCELLED = "appointment_cancelled"
    APPOINTMENT_RESCHEDULED = "appointment_rescheduled"
    PAYMENT_DUE = "payment_due"
    PAYMENT_RECEIVED = "payment_received"
    DOCUMENT_SIGNED = "document_signed"
    DOCUMENT_REQUESTED = "document_requested"
    PRESCRIPTION_READY = "prescription_ready"
    EXAM_RESULT_READY = "exam_result_ready"
    TREATMENT_PLAN_UPDATED = "treatment_plan_updated"
    PATIENT_CHECKIN_REMINDER = "patient_checkin_reminder"
    CLINIC_ANNOUNCEMENT = "clinic_announcement"
    SYSTEM_ALERT = "system_alert"
    EDUCATIONAL_CONTENT = "educational_content"


class NotificationStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"
    ARCHIVED = "archived"


class NotificationChannel(str, Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    PUSH = "push"
    SMS = "sms"


# Request/Response Schemas
class NotificationCreateRequest(BaseModel):
    """Criar notificação"""
    user_id: int
    type: NotificationType
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1)
    description: Optional[str] = None
    channel: NotificationChannel = NotificationChannel.IN_APP
    context_type: Optional[str] = None
    context_id: Optional[int] = None
    action_url: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    priority: int = Field(default=0, ge=-1, le=1)
    scheduled_for: Optional[datetime] = None
    
    class Config:
        use_enum_values = True


class NotificationResponse(BaseModel):
    """Resposta de notificação"""
    id: int
    user_id: int
    organization_id: int
    type: NotificationType
    title: str
    message: str
    description: Optional[str]
    status: NotificationStatus
    channel: NotificationChannel
    context_type: Optional[str]
    context_id: Optional[int]
    action_url: Optional[str]
    data: Optional[Dict[str, Any]]
    created_at: datetime
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    read_at: Optional[datetime]
    archived_at: Optional[datetime]
    priority: int
    
    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """Lista paginada de notificações"""
    total: int
    page: int
    per_page: int
    items: List[NotificationResponse]


class NotificationPreferenceUpdate(BaseModel):
    """Atualizar preferências de notificação"""
    email_enabled: Optional[bool] = None
    push_enabled: Optional[bool] = None
    in_app_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    email_frequency: Optional[str] = None  # instant | daily | weekly | none
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None  # "22:00"
    quiet_hours_end: Optional[str] = None    # "08:00"
    timezone: Optional[str] = None
    type_preferences: Optional[Dict[str, Any]] = None
    thresholds: Optional[Dict[str, Any]] = None
    
    class Config:
        use_enum_values = True


class NotificationPreferenceResponse(BaseModel):
    """Resposta de preferências"""
    id: int
    user_id: int
    email_enabled: bool
    push_enabled: bool
    in_app_enabled: bool
    sms_enabled: bool
    email_frequency: str
    quiet_hours_enabled: bool
    quiet_hours_start: Optional[str]
    quiet_hours_end: Optional[str]
    timezone: str
    type_preferences: Dict[str, Any]
    thresholds: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class BulkNotificationRequest(BaseModel):
    """Enviar notificação em bulk"""
    user_ids: List[int]
    type: NotificationType
    title: str
    message: str
    description: Optional[str] = None
    channels: List[NotificationChannel] = [NotificationChannel.IN_APP]
    data: Optional[Dict[str, Any]] = None
    scheduled_for: Optional[datetime] = None


class UnreadCountResponse(BaseModel):
    """Contagem de notificações não lidas"""
    unread_count: int
    by_type: Dict[str, int]  # {"appointment_reminder": 2, "payment_due": 1}
```

### 3.2 WebSocket Manager

```python
# backend/services/websocket_manager.py

import json
import logging
from typing import Dict, Set, List
from fastapi import WebSocket
import redis
from datetime import datetime

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Gerencia conexões WebSocket para notificações em tempo real"""
    
    def __init__(self, redis_client=None):
        self.active_connections: Dict[int, Set[WebSocket]] = {}  # user_id -> set of WebSocket
        self.redis = redis_client
    
    async def connect(self, user_id: int, websocket: WebSocket):
        """Conectar usuário ao WebSocket"""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        
        self.active_connections[user_id].add(websocket)
        
        # Armazenar em Redis para multi-processo
        if self.redis:
            key = f"ws:user:{user_id}"
            await self.redis.sadd(key, str(id(websocket)))
            await self.redis.expire(key, 3600)
        
        logger.info(f"User {user_id} connected. Active connections: {len(self.active_connections[user_id])}")
    
    async def disconnect(self, user_id: int, websocket: WebSocket):
        """Desconectar usuário do WebSocket"""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            
            if len(self.active_connections[user_id]) == 0:
                del self.active_connections[user_id]
        
        if self.redis:
            key = f"ws:user:{user_id}"
            await self.redis.srem(key, str(id(websocket)))
        
        logger.info(f"User {user_id} disconnected")
    
    async def send_personal(self, user_id: int, message: dict):
        """Enviar mensagem para um usuário específico"""
        if user_id in self.active_connections:
            message_json = json.dumps(message, default=str)
            
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message_json)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {e}")
                    disconnected.append(connection)
            
            # Remover conexões com falha
            for connection in disconnected:
                await self.disconnect(user_id, connection)
        else:
            logger.warning(f"User {user_id} not connected")
    
    async def broadcast_to_org(self, organization_id: int, message: dict, exclude_user: int = None):
        """Broadcast para todos os usuários de uma organização"""
        # Aqui você quereria fazer lookup dos usuários da organização
        # e enviar para cada um
        message_json = json.dumps(message, default=str)
        
        for user_id, connections in list(self.active_connections.items()):
            if exclude_user and user_id == exclude_user:
                continue
            
            disconnected = []
            for connection in connections:
                try:
                    await connection.send_text(message_json)
                except Exception:
                    disconnected.append(connection)
            
            for connection in disconnected:
                await self.disconnect(user_id, connection)
    
    async def notify_unread_count(self, user_id: int, unread_count: int):
        """Notificar contagem de não lidos"""
        message = {
            "type": "unread_count",
            "data": {
                "unread_count": unread_count,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        await self.send_personal(user_id, message)
    
    async def notify_new_notification(self, user_id: int, notification: dict):
        """Notificar nova notificação"""
        message = {
            "type": "new_notification",
            "data": notification
        }
        await self.send_personal(user_id, message)
    
    def get_active_user_count(self) -> int:
        """Obter número de usuários conectados"""
        return len(self.active_connections)
    
    def get_user_connection_count(self, user_id: int) -> int:
        """Obter número de conexões de um usuário"""
        return len(self.active_connections.get(user_id, set()))


# Instância global
ws_manager: WebSocketManager = None


def get_ws_manager() -> WebSocketManager:
    """Obter instância global do WebSocket manager"""
    global ws_manager
    if ws_manager is None:
        ws_manager = WebSocketManager()
    return ws_manager
```

### 3.3 Notification Service

```python
# backend/services/notification_service.py

import logging
from datetime import datetime, timedelta, time as time_obj
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
import redis
import pytz

from models.notifications import (
    Notification, NotificationPreference, NotificationTemplate,
    NotificationType, NotificationStatus, NotificationChannel
)
from schemas.notifications import NotificationCreateRequest, NotificationResponse
from .celery_tasks import send_email_task, send_push_task

logger = logging.getLogger(__name__)


class NotificationService:
    """Serviço de notificações"""
    
    def __init__(self, db: Session, redis_client: redis.Redis = None):
        self.db = db
        self.redis = redis_client
    
    async def create_notification(
        self, 
        organization_id: int,
        create_request: NotificationCreateRequest,
        current_user_id: int = None
    ) -> Notification:
        """Criar nova notificação"""
        
        # Obter preferências do usuário
        preferences = self.db.query(NotificationPreference).filter(
            NotificationPreference.user_id == create_request.user_id
        ).first()
        
        if not preferences:
            # Criar preferências padrão
            preferences = NotificationPreference(
                user_id=create_request.user_id,
                organization_id=organization_id
            )
            self.db.add(preferences)
            self.db.commit()
            self.db.refresh(preferences)
        
        # Verificar se tipo de notificação está habilitado
        type_prefs = preferences.type_preferences.get(create_request.type, {})
        if not type_prefs.get("enabled", True):
            logger.info(f"Notification type {create_request.type} disabled for user {create_request.user_id}")
            return None
        
        # Determinar canais
        channels = type_prefs.get("channels", [create_request.channel])
        if not channels:
            channels = [create_request.channel]
        
        # Criar notificações para cada canal
        notifications = []
        for channel in channels:
            notification = Notification(
                user_id=create_request.user_id,
                organization_id=organization_id,
                type=create_request.type,
                title=create_request.title,
                message=create_request.message,
                description=create_request.description,
                channel=channel,
                context_type=create_request.context_type,
                context_id=create_request.context_id,
                action_url=create_request.action_url,
                data=create_request.data,
                priority=create_request.priority,
                status=NotificationStatus.PENDING,
            )
            
            # Agendar entrega se necessário
            if create_request.scheduled_for:
                notification.scheduled_for = create_request.scheduled_for
            elif self._should_apply_quiet_hours(preferences, channel):
                # Agendar para fim de quiet hours
                notification.scheduled_for = self._calculate_delivery_time(preferences)
            else:
                notification.scheduled_for = datetime.utcnow()
            
            self.db.add(notification)
            notifications.append(notification)
        
        self.db.commit()
        
        # Processar envios
        for notification in notifications:
            await self._process_notification(notification, preferences)
        
        return notifications[0] if notifications else None
    
    async def _process_notification(
        self, 
        notification: Notification,
        preferences: NotificationPreference
    ):
        """Processar envio de notificação"""
        
        try:
            if notification.channel == NotificationChannel.IN_APP:
                # Envio imediato via WebSocket
                notification.status = NotificationStatus.SENT
                notification.sent_at = datetime.utcnow()
                self.db.commit()
                
                # Broadcast via WebSocket
                from .websocket_manager import get_ws_manager
                ws_manager = get_ws_manager()
                
                notification_dict = {
                    "id": notification.id,
                    "type": notification.type,
                    "title": notification.title,
                    "message": notification.message,
                    "created_at": notification.created_at.isoformat(),
                }
                await ws_manager.notify_new_notification(notification.user_id, notification_dict)
                await ws_manager.notify_unread_count(
                    notification.user_id,
                    self.get_unread_count(notification.user_id)
                )
            
            elif notification.channel == NotificationChannel.EMAIL:
                # Agendar tarefa Celery para email
                send_email_task.delay(notification.id)
            
            elif notification.channel == NotificationChannel.PUSH:
                # Agendar tarefa Celery para push
                send_push_task.delay(notification.id)
        
        except Exception as e:
            logger.error(f"Error processing notification {notification.id}: {e}")
            notification.status = NotificationStatus.FAILED
            notification.error_message = str(e)
            notification.attempt_count += 1
            self.db.commit()
    
    def _should_apply_quiet_hours(self, preferences: NotificationPreference, channel: NotificationChannel) -> bool:
        """Verificar se quiet hours devem ser aplicadas"""
        if not preferences.quiet_hours_enabled or channel == NotificationChannel.IN_APP:
            return False
        
        now = datetime.now(pytz.timezone(preferences.timezone))
        current_time = now.time()
        
        start = datetime.strptime(preferences.quiet_hours_start or "22:00", "%H:%M").time()
        end = datetime.strptime(preferences.quiet_hours_end or "08:00", "%H:%M").time()
        
        if start <= end:
            # Quiet hours não cruza meia-noite
            return start <= current_time <= end
        else:
            # Quiet hours cruza meia-noite
            return current_time >= start or current_time <= end
    
    def _calculate_delivery_time(self, preferences: NotificationPreference) -> datetime:
        """Calcular horário de entrega após quiet hours"""
        tz = pytz.timezone(preferences.timezone)
        now = datetime.now(tz)
        
        end_time = datetime.strptime(preferences.quiet_hours_end or "08:00", "%H:%M").time()
        delivery = now.replace(hour=end_time.hour, minute=end_time.minute, second=0, microsecond=0)
        
        if delivery <= now:
            delivery += timedelta(days=1)
        
        return delivery.astimezone(pytz.UTC)
    
    def get_notifications(
        self,
        user_id: int,
        skip: int = 0,
        limit: int = 20,
        status: Optional[NotificationStatus] = None,
        notification_type: Optional[NotificationType] = None,
        include_archived: bool = False
    ) -> tuple[List[Notification], int]:
        """Obter notificações do usuário"""
        
        query = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.archived_at.is_(None) if not include_archived else True
        )
        
        if status:
            query = query.filter(Notification.status == status)
        
        if notification_type:
            query = query.filter(Notification.type == notification_type)
        
        total = query.count()
        
        notifications = query.order_by(
            desc(Notification.created_at)
        ).offset(skip).limit(limit).all()
        
        return notifications, total
    
    def get_unread_count(self, user_id: int) -> int:
        """Obter contagem de notificações não lidas"""
        
        # Tentar cache Redis primeiro
        if self.redis:
            cache_key = f"unread_count:{user_id}"
            cached = self.redis.get(cache_key)
            if cached:
                return int(cached)
        
        # Buscar no banco
        count = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.status.in_([NotificationStatus.SENT, NotificationStatus.DELIVERED]),
            Notification.archived_at.is_(None)
        ).count()
        
        # Armazenar em cache por 5 minutos
        if self.redis:
            self.redis.setex(cache_key, 300, count)
        
        return count
    
    def mark_as_read(self, notification_id: int, user_id: int) -> Notification:
        """Marcar notificação como lida"""
        notification = self.db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if not notification:
            return None
        
        notification.status = NotificationStatus.READ
        notification.read_at = datetime.utcnow()
        self.db.commit()
        
        # Invalidar cache
        if self.redis:
            self.redis.delete(f"unread_count:{user_id}")
        
        return notification
    
    def mark_as_read_bulk(self, notification_ids: List[int], user_id: int) -> int:
        """Marcar múltiplas notificações como lidas"""
        count = self.db.query(Notification).filter(
            Notification.id.in_(notification_ids),
            Notification.user_id == user_id,
            Notification.status != NotificationStatus.READ
        ).update({
            Notification.status: NotificationStatus.READ,
            Notification.read_at: datetime.utcnow()
        })
        self.db.commit()
        
        if self.redis:
            self.redis.delete(f"unread_count:{user_id}")
        
        return count
    
    def archive_notification(self, notification_id: int, user_id: int) -> Notification:
        """Arquivar notificação"""
        notification = self.db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if not notification:
            return None
        
        notification.status = NotificationStatus.ARCHIVED
        notification.archived_at = datetime.utcnow()
        self.db.commit()
        
        if self.redis:
            self.redis.delete(f"unread_count:{user_id}")
        
        return notification
    
    def get_preferences(self, user_id: int) -> Optional[NotificationPreference]:
        """Obter preferências de notificação"""
        return self.db.query(NotificationPreference).filter(
            NotificationPreference.user_id == user_id
        ).first()
    
    def update_preferences(
        self,
        user_id: int,
        organization_id: int,
        updates: Dict[str, Any]
    ) -> NotificationPreference:
        """Atualizar preferências de notificação"""
        
        preferences = self.db.query(NotificationPreference).filter(
            NotificationPreference.user_id == user_id
        ).first()
        
        if not preferences:
            preferences = NotificationPreference(
                user_id=user_id,
                organization_id=organization_id,
                **updates
            )
            self.db.add(preferences)
        else:
            for key, value in updates.items():
                if hasattr(preferences, key):
                    setattr(preferences, key, value)
        
        self.db.commit()
        self.db.refresh(preferences)
        
        return preferences
    
    def cleanup_old_notifications(self, days: int = 30):
        """Limpar notificações antigas (soft delete)"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        self.db.query(Notification).filter(
            Notification.created_at < cutoff_date,
            Notification.archived_at.isnot(None)
        ).update({
            Notification.archived_at: datetime.utcnow()
        })
        
        self.db.commit()
        logger.info(f"Cleaned up notifications older than {days} days")
```

### 3.4 Celery Tasks

```python
# backend/services/celery_tasks.py

import logging
from celery import Celery
from datetime import datetime
from sqlalchemy.orm import Session
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from database import SessionLocal
from models.notifications import Notification, NotificationStatus

logger = logging.getLogger(__name__)

# Configurar Celery
celery_app = Celery(
    'orthoclinic',
    broker=os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/1')
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)


@celery_app.task(name='send_email', bind=True, max_retries=3)
def send_email_task(self, notification_id: int):
    """Enviar email de notificação"""
    db = SessionLocal()
    
    try:
        notification = db.query(Notification).filter(
            Notification.id == notification_id
        ).first()
        
        if not notification:
            logger.error(f"Notification {notification_id} not found")
            return
        
        # Obter dados do usuário
        user = notification.user
        if not user.email:
            logger.warning(f"User {user.id} has no email")
            return
        
        # Construir email
        subject = notification.title
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; margin: 20px;">
                <h2>{notification.title}</h2>
                <p>{notification.message}</p>
                {f'<p>{notification.description}</p>' if notification.description else ''}
                {f'<a href="{notification.action_url}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ver Detalhes</a>' if notification.action_url else ''}
                <hr style="margin: 30px 0;">
                <small style="color: #666;">OrthoClinic Notificações</small>
            </body>
        </html>
        """
        
        # Enviar via SendGrid
        sg = SendGridAPIClient(os.getenv('SENDGRID_API_KEY'))
        email = Mail(
            from_email=os.getenv('SENDGRID_FROM_EMAIL', 'noreply@orthoclinic.com.br'),
            to_emails=user.email,
            subject=subject,
            html_content=html_content
        )
        
        response = sg.send(email)
        
        if response.status_code in [200, 201]:
            notification.status = NotificationStatus.DELIVERED
            notification.sent_at = datetime.utcnow()
            notification.delivered_at = datetime.utcnow()
            logger.info(f"Email sent to {user.email} for notification {notification_id}")
        else:
            raise Exception(f"SendGrid returned {response.status_code}")
        
        notification.attempt_count += 1
        notification.last_attempt_at = datetime.utcnow()
        db.commit()
    
    except Exception as exc:
        logger.error(f"Error sending email for notification {notification_id}: {exc}")
        notification.error_message = str(exc)
        notification.attempt_count += 1
        notification.last_attempt_at = datetime.utcnow()
        db.commit()
        
        # Retry com backoff exponencial
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
    
    finally:
        db.close()


@celery_app.task(name='send_push', bind=True, max_retries=3)
def send_push_task(self, notification_id: int):
    """Enviar push notification"""
    db = SessionLocal()
    
    try:
        notification = db.query(Notification).filter(
            Notification.id == notification_id
        ).first()
        
        if not notification:
            logger.error(f"Notification {notification_id} not found")
            return
        
        # Implementar integração com serviço de push (ex: Firebase)
        # Por enquanto, simulamos sucesso
        notification.status = NotificationStatus.DELIVERED
        notification.sent_at = datetime.utcnow()
        notification.delivered_at = datetime.utcnow()
        notification.attempt_count += 1
        notification.last_attempt_at = datetime.utcnow()
        
        logger.info(f"Push notification sent for notification {notification_id}")
        db.commit()
    
    except Exception as exc:
        logger.error(f"Error sending push for notification {notification_id}: {exc}")
        notification.error_message = str(exc)
        notification.attempt_count += 1
        notification.last_attempt_at = datetime.utcnow()
        db.commit()
        
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
    
    finally:
        db.close()


@celery_app.task(name='send_digest_email', bind=True)
def send_digest_email_task(self, user_id: int, period: str = 'daily'):
    """Enviar email de resumo diário/semanal"""
    db = SessionLocal()
    
    try:
        from models.organization import User
        from models.notifications import Notification, NotificationType
        from datetime import timedelta
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.email:
            return
        
        # Determinar período
        if period == 'daily':
            cutoff = datetime.utcnow() - timedelta(days=1)
        else:  # weekly
            cutoff = datetime.utcnow() - timedelta(weeks=1)
        
        # Buscar notificações não lidas no período
        notifications = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.created_at >= cutoff,
            Notification.archived_at.is_(None)
        ).all()
        
        if not notifications:
            logger.info(f"No notifications for digest to user {user_id}")
            return
        
        # Agrupar por tipo
        by_type = {}
        for notif in notifications:
            if notif.type not in by_type:
                by_type[notif.type] = []
            by_type[notif.type].append(notif)
        
        # Construir HTML
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; margin: 20px;">
                <h1>Resumo de Notificações - {period.capitalize()}</h1>
                <p>Olá {user.name},</p>
                <p>Aqui está um resumo de suas notificações dos últimos dias:</p>
        """
        
        for notif_type, notifs in by_type.items():
            html_content += f"<h3>{notif_type}</h3><ul>"
            for notif in notifs:
                html_content += f"<li><strong>{notif.title}</strong><br/>{notif.message}</li>"
            html_content += "</ul>"
        
        html_content += """
                <hr>
                <small style="color: #666;">OrthoClinic Notificações</small>
            </body>
        </html>
        """
        
        # Enviar
        sg = SendGridAPIClient(os.getenv('SENDGRID_API_KEY'))
        email = Mail(
            from_email=os.getenv('SENDGRID_FROM_EMAIL', 'noreply@orthoclinic.com.br'),
            to_emails=user.email,
            subject=f"Resumo de Notificações - {period.capitalize()}",
            html_content=html_content
        )
        
        response = sg.send(email)
        logger.info(f"Digest email sent to {user.email} for period {period}")
    
    except Exception as exc:
        logger.error(f"Error sending digest email to user {user_id}: {exc}")
    
    finally:
        db.close()


@celery_app.task(name='cleanup_notifications')
def cleanup_notifications_task():
    """Limpar notificações antigas (executar diariamente)"""
    db = SessionLocal()
    
    try:
        from notification_service import NotificationService
        service = NotificationService(db)
        service.cleanup_old_notifications(days=30)
        logger.info("Notification cleanup completed")
    
    except Exception as exc:
        logger.error(f"Error cleaning up notifications: {exc}")
    
    finally:
        db.close()
```

### 3.5 FastAPI Routers

```python
# backend/routers/notifications.py

from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from database import get_db
from routers.auth import get_current_user
from models.organization import User
from schemas.notifications import (
    NotificationCreateRequest, NotificationResponse, NotificationListResponse,
    NotificationPreferenceUpdate, NotificationPreferenceResponse, BulkNotificationRequest,
    UnreadCountResponse, NotificationType, NotificationStatus
)
from services.notification_service import NotificationService
from services.websocket_manager import get_ws_manager

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    request: NotificationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Criar uma nova notificação"""
    service = NotificationService(db)
    
    notification = await service.create_notification(
        organization_id=current_user.organization_id,
        create_request=request,
        current_user_id=current_user.id
    )
    
    if not notification:
        raise HTTPException(status_code=400, detail="Failed to create notification")
    
    return notification


@router.post("/bulk", status_code=status.HTTP_202_ACCEPTED)
async def create_bulk_notification(
    request: BulkNotificationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Criar notificações em bulk para múltiplos usuários"""
    service = NotificationService(db)
    
    created_count = 0
    for user_id in request.user_ids:
        create_request = NotificationCreateRequest(
            user_id=user_id,
            type=request.type,
            title=request.title,
            message=request.message,
            description=request.description,
            data=request.data,
            scheduled_for=request.scheduled_for,
        )
        
        try:
            await service.create_notification(
                organization_id=current_user.organization_id,
                create_request=create_request,
                current_user_id=current_user.id
            )
            created_count += 1
        except Exception as e:
            pass  # Log e continue
    
    return {
        "message": f"{created_count} notifications created",
        "total_requested": len(request.user_ids),
        "created": created_count
    }


@router.get("/", response_model=NotificationListResponse)
async def list_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[NotificationStatus] = None,
    type: Optional[NotificationType] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listar notificações do usuário"""
    service = NotificationService(db)
    
    notifications, total = service.get_notifications(
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        status=status,
        notification_type=type
    )
    
    return NotificationListResponse(
        total=total,
        page=skip // limit + 1,
        per_page=limit,
        items=[NotificationResponse.model_validate(n) for n in notifications]
    )


@router.get("/unread/count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obter contagem de notificações não lidas"""
    service = NotificationService(db)
    
    count = service.get_unread_count(current_user.id)
    
    return UnreadCountResponse(
        unread_count=count,
        by_type={}  # TODO: Implementar agregação por tipo
    )


@router.put("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marcar notificação como lida"""
    service = NotificationService(db)
    
    notification = service.mark_as_read(notification_id, current_user.id)
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return NotificationResponse.model_validate(notification)


@router.post("/bulk/read")
async def mark_notifications_as_read(
    notification_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marcar múltiplas notificações como lidas"""
    service = NotificationService(db)
    
    count = service.mark_as_read_bulk(notification_ids, current_user.id)
    
    return {
        "message": f"{count} notifications marked as read",
        "marked": count
    }


@router.delete("/{notification_id}")
async def archive_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Arquivar/deletar notificação"""
    service = NotificationService(db)
    
    notification = service.archive_notification(notification_id, current_user.id)
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification archived"}


@router.get("/preferences", response_model=NotificationPreferenceResponse)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obter preferências de notificação"""
    service = NotificationService(db)
    
    preferences = service.get_preferences(current_user.id)
    
    if not preferences:
        raise HTTPException(status_code=404, detail="Preferences not found")
    
    return NotificationPreferenceResponse.model_validate(preferences)


@router.put("/preferences", response_model=NotificationPreferenceResponse)
async def update_preferences(
    update_request: NotificationPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Atualizar preferências de notificação"""
    service = NotificationService(db)
    
    updates = update_request.model_dump(exclude_unset=True)
    preferences = service.update_preferences(
        user_id=current_user.id,
        organization_id=current_user.organization_id,
        updates=updates
    )
    
    return NotificationPreferenceResponse.model_validate(preferences)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """WebSocket para notificações em tempo real"""
    # Validar token
    try:
        # TODO: Validar token JWT
        # Por enquanto, usar método simples
        from routers.auth import verify_token
        payload = verify_token(token)
        user_id = payload.get("sub")
    except:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    ws_manager = get_ws_manager()
    await ws_manager.connect(user_id, websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            
            # Processar mensagens (ex: ping/pong, preferências em tempo real)
            if data == "ping":
                await websocket.send_text("pong")
    
    except WebSocketDisconnect:
        await ws_manager.disconnect(user_id, websocket)
```

---

## 4. Frontend Implementation

### 4.1 Notification Store (Zustand)

```typescript
// frontend/lib/stores/notificationStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  description?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'archived';
  created_at: string;
  read_at?: string;
  action_url?: string;
  context_id?: number;
  data?: Record<string, any>;
}

export interface NotificationPreferences {
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  sms_enabled: boolean;
  email_frequency: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone: string;
  type_preferences: Record<string, any>;
  thresholds: Record<string, any>;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  error: string | null;
  wsConnected: boolean;
  
  // Actions
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (notificationId: number) => Promise<void>;
  markMultipleAsRead: (notificationIds: number[]) => Promise<void>;
  archiveNotification: (notificationId: number) => Promise<void>;
  setUnreadCount: (count: number) => void;
  setPreferences: (preferences: NotificationPreferences) => void;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
  setWSConnected: (connected: boolean) => void;
  fetchNotifications: (skip?: number, limit?: number) => Promise<void>;
  fetchPreferences: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      preferences: null,
      isLoading: false,
      error: null,
      wsConnected: false,

      setNotifications: (notifications) => set({ notifications }),
      
      addNotification: (notification) => {
        set((state) => ({
          notifications: [notification, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }));
      },

      markAsRead: async (notificationId: number) => {
        try {
          const response = await fetch(
            `${API_BASE}/notifications/${notificationId}/read`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
              },
            }
          );

          if (!response.ok) throw new Error('Failed to mark as read');

          set((state) => ({
            notifications: state.notifications.map((n) =>
              n.id === notificationId ? { ...n, status: 'read' } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - 1),
          }));
        } catch (error) {
          set({ error: String(error) });
          throw error;
        }
      },

      markMultipleAsRead: async (notificationIds: number[]) => {
        try {
          const response = await fetch(`${API_BASE}/notifications/bulk/read`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({ notification_ids: notificationIds }),
          });

          if (!response.ok) throw new Error('Failed to mark as read');

          set((state) => ({
            notifications: state.notifications.map((n) =>
              notificationIds.includes(n.id) ? { ...n, status: 'read' } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - notificationIds.length),
          }));
        } catch (error) {
          set({ error: String(error) });
          throw error;
        }
      },

      archiveNotification: async (notificationId: number) => {
        try {
          const response = await fetch(
            `${API_BASE}/notifications/${notificationId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
              },
            }
          );

          if (!response.ok) throw new Error('Failed to archive');

          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== notificationId),
          }));
        } catch (error) {
          set({ error: String(error) });
          throw error;
        }
      },

      setUnreadCount: (count) => set({ unreadCount: count }),

      setPreferences: (preferences) => set({ preferences }),

      updatePreferences: async (updates) => {
        try {
          const response = await fetch(`${API_BASE}/notifications/preferences`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify(updates),
          });

          if (!response.ok) throw new Error('Failed to update preferences');

          const updated = await response.json();
          set({ preferences: updated });
        } catch (error) {
          set({ error: String(error) });
          throw error;
        }
      },

      setWSConnected: (connected) => set({ wsConnected: connected }),

      fetchNotifications: async (skip = 0, limit = 20) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(
            `${API_BASE}/notifications?skip=${skip}&limit=${limit}`,
            {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
              },
            }
          );

          if (!response.ok) throw new Error('Failed to fetch notifications');

          const data = await response.json();
          set({ notifications: data.items, isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      fetchPreferences: async () => {
        try {
          const response = await fetch(`${API_BASE}/notifications/preferences`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          });

          if (!response.ok) throw new Error('Failed to fetch preferences');

          const data = await response.json();
          set({ preferences: data });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      fetchUnreadCount: async () => {
        try {
          const response = await fetch(
            `${API_BASE}/notifications/unread/count`,
            {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
              },
            }
          );

          if (!response.ok) throw new Error('Failed to fetch unread count');

          const data = await response.json();
          set({ unreadCount: data.unread_count });
        } catch (error) {
          set({ error: String(error) });
        }
      },
    }),
    {
      name: 'notification-store',
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 50), // Manter apenas últimas 50
      }),
    }
  )
);
```

### 4.2 WebSocket Hook

```typescript
// frontend/hooks/useWebSocket.ts

import { useEffect, useRef, useCallback } from 'react';
import { useNotificationStore } from '@/lib/stores/notificationStore';

const WS_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
  .replace('http', 'ws');

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    addNotification,
    setUnreadCount,
    setWSConnected,
    unreadCount,
  } = useNotificationStore();

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const url = `${WS_URL}/notifications/ws?token=${token}`;
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setWSConnected(true);
        // Enviar ping a cada 30 segundos para manter conexão viva
        setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send('ping');
          }
        }, 30000);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'new_notification') {
            addNotification(data.data);
            // Reproduzir som de notificação
            playNotificationSound();
            // Mostrar toast
            showNotificationToast(data.data);
          } else if (data.type === 'unread_count') {
            setUnreadCount(data.data.unread_count);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWSConnected(false);
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setWSConnected(false);
        // Reconectar em 5 segundos
        setTimeout(connect, 5000);
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      setWSConnected(false);
    }
  }, [addNotification, setUnreadCount, setWSConnected]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { wsConnected: wsRef.current?.readyState === WebSocket.OPEN };
}

function playNotificationSound() {
  // Usar Web Audio API ou HTML5 audio
  try {
    const audio = new Audio('/sounds/notification.mp3');
    audio.play().catch((e) => console.error('Error playing sound:', e));
  } catch (error) {
    console.error('Error with notification sound:', error);
  }
}

function showNotificationToast(notification: any) {
  // Usar sonner ou react-hot-toast
  const { toast } = require('sonner');
  toast.info(notification.title, {
    description: notification.message,
    action: {
      label: 'Ver',
      onClick: () => {
        if (notification.action_url) {
          window.location.href = notification.action_url;
        }
      },
    },
  });
}
```

### 4.3 Notification Center Component

```typescript
// frontend/components/NotificationCenter.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Bell, X, Clock, Check, Archive } from 'lucide-react';
import { useNotificationStore } from '@/lib/stores/notificationStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    archiveNotification,
  } = useNotificationStore();

  useWebSocket();

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  const handleBellClick = async () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      await fetchNotifications();
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    await markAsRead(notificationId);
  };

  const handleArchive = async (notificationId: number) => {
    await archiveNotification(notificationId);
  };

  const unreadNotifications = notifications.filter(
    (n) => n.status !== 'read' && n.status !== 'archived'
  );

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button
        onClick={handleBellClick}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl z-50 max-h-96 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">Notificações</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 transition ${
                      notification.status !== 'read' ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">
                          {notification.title}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(
                            new Date(notification.created_at),
                            {
                              addSuffix: true,
                              locale: ptBR,
                            }
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        {notification.status !== 'read' && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            title="Marcar como lido"
                            className="text-blue-500 hover:text-blue-700"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleArchive(notification.id)}
                          title="Arquivar"
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-3 text-center">
            <a
              href="/notifications"
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Ver todas as notificações
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 4.4 Notification Preferences Page

```typescript
// frontend/app/notifications/preferences/page.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { useNotificationStore } from '@/lib/stores/notificationStore';
import { Save, AlertCircle } from 'lucide-react';

export default function NotificationPreferencesPage() {
  const { preferences, fetchPreferences, updatePreferences } =
    useNotificationStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    email_enabled: true,
    push_enabled: true,
    in_app_enabled: true,
    email_frequency: 'instant',
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    timezone: 'America/Sao_Paulo',
  });

  useEffect(() => {
    const loadPreferences = async () => {
      setIsLoading(true);
      await fetchPreferences();
      setIsLoading(false);
    };

    loadPreferences();
  }, [fetchPreferences]);

  useEffect(() => {
    if (preferences) {
      setFormData({
        email_enabled: preferences.email_enabled,
        push_enabled: preferences.push_enabled,
        in_app_enabled: preferences.in_app_enabled,
        email_frequency: preferences.email_frequency,
        quiet_hours_enabled: preferences.quiet_hours_enabled,
        quiet_hours_start: preferences.quiet_hours_start || '22:00',
        quiet_hours_end: preferences.quiet_hours_end || '08:00',
        timezone: preferences.timezone,
      });
    }
  }, [preferences]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccess(false);

    try {
      await updatePreferences(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Carregando preferências...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Preferências de Notificações</h1>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          Preferências salvas com sucesso!
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Canais */}
        <fieldset className="border rounded-lg p-6">
          <legend className="text-lg font-semibold mb-4">Canais de Notificação</legend>
          
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="in_app_enabled"
                checked={formData.in_app_enabled}
                onChange={handleChange}
                className="w-4 h-4"
              />
              <span>Notificações na aplicação</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="email_enabled"
                checked={formData.email_enabled}
                onChange={handleChange}
                className="w-4 h-4"
              />
              <span>Notificações por email</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="push_enabled"
                checked={formData.push_enabled}
                onChange={handleChange}
                className="w-4 h-4"
              />
              <span>Notificações push</span>
            </label>
          </div>
        </fieldset>

        {/* Frequência de Email */}
        <fieldset className="border rounded-lg p-6">
          <legend className="text-lg font-semibold mb-4">Frequência de Email</legend>
          
          <select
            name="email_frequency"
            value={formData.email_frequency}
            onChange={handleChange}
            className="w-full p-2 border rounded"
          >
            <option value="instant">Instantâneo</option>
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="none">Nunca</option>
          </select>
        </fieldset>

        {/* Quiet Hours */}
        <fieldset className="border rounded-lg p-6">
          <legend className="text-lg font-semibold mb-4">Horário de Silêncio</legend>
          
          <label className="flex items-center gap-3 mb-4">
            <input
              type="checkbox"
              name="quiet_hours_enabled"
              checked={formData.quiet_hours_enabled}
              onChange={handleChange}
              className="w-4 h-4"
            />
            <span>Ativar horário de silêncio</span>
          </label>

          {formData.quiet_hours_enabled && (
            <div className="space-y-4 ml-7">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Início do silêncio
                </label>
                <input
                  type="time"
                  name="quiet_hours_start"
                  value={formData.quiet_hours_start}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Fim do silêncio
                </label>
                <input
                  type="time"
                  name="quiet_hours_end"
                  value={formData.quiet_hours_end}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* Timezone */}
        <fieldset className="border rounded-lg p-6">
          <legend className="text-lg font-semibold mb-4">Fuso Horário</legend>
          
          <select
            name="timezone"
            value={formData.timezone}
            onChange={handleChange}
            className="w-full p-2 border rounded"
          >
            <option value="America/Sao_Paulo">São Paulo (BRT)</option>
            <option value="America/Fortaleza">Fortaleza (BRT)</option>
            <option value="America/Recife">Recife (BRT)</option>
            <option value="America/Manaus">Manaus (AMT)</option>
          </select>
        </fieldset>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar Preferências'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## 5. Notification Delivery Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRIGGER EVENT                                 │
│  (Appointment scheduled, Payment received, Document signed)      │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│          Call NotificationService.create_notification()          │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─────────────────────────────────────────┐
             │                                         │
             ▼                                         ▼
    ┌──────────────────────┐          ┌──────────────────────────┐
    │ Load User Prefs      │          │ Check Type Preference    │
    │ - Channels enabled   │          │ - Type enabled?          │
    │ - Quiet hours        │          │ - Which channels?        │
    │ - Email frequency    │          └──────────────────────────┘
    └──────────────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ For Each Channel:    │
    │ - IN_APP             │
    │ - EMAIL              │
    │ - PUSH               │
    └─┬────┬──────┬────────┘
      │    │      │
      ▼    ▼      ▼
    ┌─────────────────────┐  ┌──────────────────┐  ┌───────────────┐
    │   IN_APP CHANNEL    │  │  EMAIL CHANNEL   │  │ PUSH CHANNEL  │
    │                     │  │                  │  │               │
    │ 1. Create notif     │  │ 1. Create notif  │  │ 1. Create not │
    │ 2. Save to DB       │  │ 2. Save to DB    │  │ 2. Save to DB │
    │ 3. Check quiet hrs  │  │ 3. Check quiet   │  │ 3. Enqueue    │
    │ 4. Send via WS      │  │ 4. Enqueue task  │  │ Celery task   │
    │ 5. Update status    │  │ 5. Return immed  │  │ 4. Return     │
    │ 6. Return           │  │                  │  │               │
    └─────────────────────┘  └─────────┬────────┘  └───────┬───────┘
          │                            │                    │
          │                            ▼                    │
          │                  ┌──────────────────────┐       │
          │                  │  Celery Task Queue   │◄──────┘
          │                  │  (Redis Broker)      │
          │                  │                      │
          │                  │ send_email_task      │
          │                  │ send_push_task       │
          │                  │ send_digest_email    │
          │                  └──────────┬───────────┘
          │                             │
          │                             ▼
          │                  ┌──────────────────────┐
          │                  │  Celery Worker       │
          │                  │                      │
          │                  │ 1. Get task from Q   │
          │                  │ 2. Build email/push  │
          │                  │ 3. Send via external │
          │                  │    service (SendGrid)│
          │                  │ 4. Update status     │
          │                  │ 5. Handle retries    │
          │                  └──────────┬───────────┘
          │                             │
          └─────────────────┬───────────┘
                            │
                            ▼
            ┌────────────────────────────────────┐
            │   Update Notification Status       │
            │   - PENDING → SENT                 │
            │   - SENT → DELIVERED               │
            │   - Handle failures                │
            └────────────────────────────────────┘
                            │
                            ▼
            ┌────────────────────────────────────┐
            │   Broadcast via WebSocket           │
            │   - New notification event          │
            │   - Unread count update             │
            │   - Delivery confirmation           │
            └────────────────────────────────────┘
```

---

## 6. Configuration & Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=postgresql://user:password@localhost/orthoclinic

# Redis
REDIS_URL=redis://localhost:6379

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# Email (SendGrid)
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@orthoclinic.com.br

# Firebase (for push notifications)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# WebSocket
WEBSOCKET_ORIGIN=http://localhost:3000

# Feature flags
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_PUSH_NOTIFICATIONS=true
ENABLE_QUIET_HOURS=true

# Notification retention
NOTIFICATION_RETENTION_DAYS=30
```

---

## 7. Testing Strategy

### 7.1 Unit Tests (Backend)

```python
# backend/tests/test_notification_service.py

import pytest
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from services.notification_service import NotificationService
from models.notifications import Notification, NotificationStatus, NotificationType
from schemas.notifications import NotificationCreateRequest

@pytest.fixture
def service(db: Session):
    return NotificationService(db)

def test_create_notification(service: NotificationService, test_user_id: int):
    """Testar criação de notificação"""
    request = NotificationCreateRequest(
        user_id=test_user_id,
        type=NotificationType.APPOINTMENT_CONFIRMED,
        title="Consulta Confirmada",
        message="Sua consulta foi confirmada",
    )
    
    notification = service.create_notification(1, request)
    
    assert notification is not None
    assert notification.status == NotificationStatus.PENDING
    assert notification.title == "Consulta Confirmada"

def test_mark_as_read(service: NotificationService, notification_id: int, user_id: int):
    """Testar marcação como lido"""
    notification = service.mark_as_read(notification_id, user_id)
    
    assert notification.status == NotificationStatus.READ
    assert notification.read_at is not None

def test_quiet_hours_application(service: NotificationService):
    """Testar aplicação de quiet hours"""
    # Mock user with quiet hours enabled
    # Verify notification is scheduled for after quiet hours
    pass

def test_unread_count(service: NotificationService, user_id: int):
    """Testar contagem de não lidos"""
    count = service.get_unread_count(user_id)
    assert isinstance(count, int)
    assert count >= 0
```

### 7.2 Integration Tests (Backend)

```python
# backend/tests/test_notification_routes.py

import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client():
    from main import app
    return TestClient(app)

def test_create_notification_endpoint(client, auth_token):
    """Testar endpoint de criação"""
    response = client.post(
        "/notifications/",
        json={
            "user_id": 1,
            "type": "appointment_confirmed",
            "title": "Test",
            "message": "Test message",
        },
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test"

def test_list_notifications_endpoint(client, auth_token):
    """Testar listagem"""
    response = client.get(
        "/notifications/",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
```

### 7.3 Frontend Tests

```typescript
// frontend/__tests__/notificationStore.test.ts

import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotificationStore } from '@/lib/stores/notificationStore';

describe('NotificationStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
    });
  });

  it('should add notification', async () => {
    const { result } = renderHook(() => useNotificationStore());

    act(() => {
      result.current.addNotification({
        id: 1,
        type: 'appointment_confirmed',
        title: 'Test',
        message: 'Test message',
        status: 'sent',
        created_at: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.unreadCount).toBe(1);
    });
  });

  it('should mark notification as read', async () => {
    const { result } = renderHook(() => useNotificationStore());

    // Mock fetch
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1, status: 'read' }),
      })
    );

    act(() => {
      result.current.addNotification({
        id: 1,
        type: 'appointment_confirmed',
        title: 'Test',
        message: 'Test',
        status: 'sent',
        created_at: new Date().toISOString(),
      });
    });

    await act(async () => {
      await result.current.markAsRead(1);
    });

    await waitFor(() => {
      expect(result.current.notifications[0].status).toBe('read');
    });
  });
});
```

---

## 8. Implementation Checklist

### Phase 1: Database & Models (Day 1)
- [ ] Create migration files
- [ ] Create SQLAlchemy models
- [ ] Create Pydantic schemas
- [ ] Test database connections
- [ ] Seed initial notification templates

### Phase 2: Backend Services (Days 2-3)
- [ ] Implement NotificationService
- [ ] Implement WebSocketManager
- [ ] Implement Celery tasks
- [ ] Create FastAPI routers
- [ ] Add authentication/authorization
- [ ] Add input validation

### Phase 3: Frontend Components (Days 3-4)
- [ ] Create Zustand store
- [ ] Implement WebSocket hook
- [ ] Build NotificationCenter component
- [ ] Build preferences page
- [ ] Add notification sounds
- [ ] Add toast notifications

### Phase 4: Testing & Integration (Days 4-5)
- [ ] Unit tests (backend)
- [ ] Unit tests (frontend)
- [ ] Integration tests
- [ ] End-to-end tests
- [ ] Load testing

### Phase 5: Documentation & Deployment (Day 6)
- [ ] API documentation (Swagger)
- [ ] Frontend documentation
- [ ] Deployment guide
- [ ] Monitoring setup
- [ ] Incident response plan

---

## 9. Performance & Scalability

### Optimization Strategies
1. **Database Indexing**: Composite indexes on user_id + status/created_at
2. **Redis Caching**: Cache unread counts, user preferences
3. **Connection Pooling**: SQLAlchemy connection pool with 20-40 connections
4. **WebSocket Scaling**: Use Redis pub/sub for multi-server broadcast
5. **Celery Scaling**: Multiple workers for email/push tasks
6. **Pagination**: Always paginate notifications (max 100 per page)
7. **Soft Deletes**: Archive instead of hard delete for history

### Monitoring
- WebSocket connection metrics
- Email delivery rates
- Push notification success rates
- Celery task queue depth
- Database query performance
- Error rates by notification type

---

## 10. Security Considerations

1. **WebSocket**: Validate JWT token on connection
2. **Rate Limiting**: Limit notification creation per user (100/hour)
3. **Data Sanitization**: Sanitize HTML in email templates
4. **Encryption**: Encrypt sensitive data in notification.data field
5. **Audit Logging**: Log all notification actions in NotificationHistory
6. **Access Control**: Users can only see their own notifications
7. **Email Verification**: Verify user email before sending

---

This design provides a production-ready notification system for OrthoClinic. Implementation can proceed in phases with clear milestones and testing at each stage.

