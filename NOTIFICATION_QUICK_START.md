# OrthoClinic Notification System - Quick Start Guide

**For:** Senior Full-Stack Developers  
**Version:** 1.0.0  
**Last Updated:** June 7, 2026

---

## 1. Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (React)                          │
│         ┌──────────────────┐      ┌────────────────────┐           │
│         │ Notification UI  │◄─────┤ Zustand Store      │           │
│         │  - Bell icon     │      │ (State Mgmt)       │           │
│         │  - Dropdown      │      └────────────────────┘           │
│         │  - Preferences   │              ▲                        │
│         └──────────────────┘              │                        │
│                                    WebSocket (Real-time)           │
│                                           │                        │
└───────────────────────────────────────────┼────────────────────────┘
                                            │
                              ┌─────────────▼──────────────┐
                              │ FastAPI Backend            │
                              │ ┌──────────────────────┐   │
                              │ │ WebSocket Manager    │   │
                              │ │ - Connection pool    │   │
                              │ │ - Broadcasting       │   │
                              │ └──────────────────────┘   │
                              │ ┌──────────────────────┐   │
                              │ │ Notification Service │   │
                              │ │ - CRUD operations    │   │
                              │ │ - Preference check   │   │
                              │ │ - Quiet hours logic  │   │
                              │ └──────────────────────┘   │
                              │ ┌──────────────────────┐   │
                              │ │ FastAPI Routers      │   │
                              │ │ (/notifications/*)   │   │
                              │ └──────────────────────┘   │
                              └──────────┬─────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
         ┌──────────▼─────────┐ ┌────────▼────────┐ ┌────────▼────────┐
         │  PostgreSQL DB     │ │  Redis Cache    │ │ Celery Queue    │
         │ (Persist)          │ │ (Performance)   │ │ (Async Tasks)   │
         │ - notifications    │ │ - Unread count  │ │ - Email         │
         │ - preferences      │ │ - Sessions      │ │ - Push          │
         │ - history          │ │ - Rate limit    │ │ - Digest        │
         └────────────────────┘ └─────────────────┘ └────────┬────────┘
                                                             │
                                                    ┌────────▼────────┐
                                                    │ External APIs   │
                                                    │ - SendGrid (Email)
                                                    │ - Firebase (Push)
                                                    └─────────────────┘
```

---

## 2. Core Concepts

### Notification Lifecycle

```
User Action (e.g., Appointment Created)
    │
    ├─ Determine channels based on user preferences
    │
    ├─ IN_APP: Send immediately via WebSocket
    │   └─ Status: SENT → DELIVERED → READ
    │
    ├─ EMAIL: Enqueue Celery task
    │   └─ Status: PENDING → SENT → DELIVERED
    │
    └─ PUSH: Enqueue Celery task
        └─ Status: PENDING → SENT → DELIVERED

All statuses stored in PostgreSQL
Badge count cached in Redis
History maintained for 30 days
```

### Data Flow Example: Appointment Confirmation

```python
# 1. Trigger (from consultations router)
appointment = create_appointment(patient_id, date)

# 2. Create notification
notification_service.create_notification(
    user_id=patient.user_id,
    type=NotificationType.APPOINTMENT_CONFIRMED,
    title="Consulta Confirmada",
    message=f"Sua consulta em {date} foi confirmada",
    context_id=appointment.id,
    context_type="appointment"
)

# 3. Service checks preferences:
# - User has email_enabled=true and in_app_enabled=true
# - Creates 2 notifications (one per channel)
# - Applies quiet_hours logic if enabled

# 4. Broadcast results:
# - IN_APP: Sends via WebSocket immediately
# - EMAIL: Enqueues Celery task send_email_task()

# 5. Frontend updates:
# - Receives notification via WebSocket
# - Displays toast/alert to user
# - Updates Zustand store
# - Increments unread badge
```

---

## 3. Quick Setup (20 minutes)

### Backend Setup

#### Step 1: Create Models File
```python
# backend/models/notifications.py
# Copy from NOTIFICATION_SYSTEM_DESIGN.md section 2.1
# ~450 lines
```

#### Step 2: Create Schemas File
```python
# backend/schemas/notifications.py
# Copy from NOTIFICATION_SYSTEM_DESIGN.md section 3.1
# ~350 lines
```

#### Step 3: Create Service File
```python
# backend/services/notification_service.py
# Copy from NOTIFICATION_SYSTEM_DESIGN.md section 3.3
# ~350 lines
```

#### Step 4: Create WebSocket Manager
```python
# backend/services/websocket_manager.py
# Copy from NOTIFICATION_SYSTEM_DESIGN.md section 3.2
# ~150 lines
```

#### Step 5: Create Celery Tasks
```python
# backend/services/celery_tasks.py
# Copy from NOTIFICATION_SYSTEM_DESIGN.md section 3.4
# ~200 lines
```

#### Step 6: Create Router
```python
# backend/routers/notifications.py
# Copy from NOTIFICATION_SYSTEM_DESIGN.md section 3.5
# ~350 lines

# Then in backend/main.py, add:
from routers.notifications import router as notifications_router
app.include_router(notifications_router)
```

#### Step 7: Run Migrations
```bash
cd backend
alembic upgrade head
```

#### Step 8: Start Services
```bash
# Terminal 1: FastAPI server
python main.py

# Terminal 2: Celery worker
celery -A services.celery_tasks worker --loglevel=info

# Terminal 3: Celery beat (for scheduled tasks)
celery -A services.celery_tasks beat --loglevel=info
```

### Frontend Setup

#### Step 1: Create Store
```typescript
// frontend/lib/stores/notificationStore.ts
// Copy from NOTIFICATION_SYSTEM_DESIGN.md section 4.1
// ~350 lines
```

#### Step 2: Create WebSocket Hook
```typescript
// frontend/hooks/useWebSocket.ts
// Copy from NOTIFICATION_SYSTEM_DESIGN.md section 4.2
// ~150 lines
```

#### Step 3: Create Notification Center Component
```typescript
// frontend/components/NotificationCenter.tsx
// Copy from NOTIFICATION_SYSTEM_DESIGN.md section 4.3
// ~300 lines
```

#### Step 4: Add to Layout
```typescript
// frontend/app/layout.tsx
import { NotificationCenter } from '@/components/NotificationCenter';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <header>
          {/* ... other header content ... */}
          <NotificationCenter /> {/* Add here */}
        </header>
        {children}
      </body>
    </html>
  );
}
```

#### Step 5: Create Preferences Page
```typescript
// frontend/app/notifications/preferences/page.tsx
// Copy from NOTIFICATION_SYSTEM_DESIGN.md section 4.4
// ~300 lines
```

#### Step 6: Start Frontend
```bash
cd frontend
npm run dev
```

---

## 4. Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost/orthoclinic_dev

# Redis
REDIS_URL=redis://localhost:6379/0

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# Email (SendGrid)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@orthoclinic.local

# WebSocket
WEBSOCKET_ORIGIN=http://localhost:3000

# Features
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_PUSH_NOTIFICATIONS=false
ENABLE_QUIET_HOURS=true

# Notification retention
NOTIFICATION_RETENTION_DAYS=30
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 5. Testing Quick Reference

### Backend Tests
```bash
# Run all tests
pytest

# Run specific test file
pytest backend/tests/test_notification_service.py

# With coverage
pytest --cov=services --cov=routers

# Watch mode
pytest-watch
```

### Frontend Tests
```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Manual Testing

#### 1. Test WebSocket Connection
```bash
# Terminal 1: Run backend
python main.py

# Terminal 2: Test WebSocket
wscat -c "ws://localhost:8000/notifications/ws?token=YOUR_JWT_TOKEN"

# Should see connection messages
Connected (press CTRL+C to quit)

# Type "ping" and press Enter
> ping
< pong
```

#### 2. Test Email Sending
```python
# Python REPL
from services.notification_service import NotificationService
from database import SessionLocal
from schemas.notifications import NotificationCreateRequest, NotificationType

db = SessionLocal()
service = NotificationService(db)

# Create test notification
notification = service.create_notification(
    organization_id=1,
    create_request=NotificationCreateRequest(
        user_id=1,
        type=NotificationType.APPOINTMENT_CONFIRMED,
        title="Test",
        message="Test message",
        channel="email"
    )
)

print(f"Created: {notification.id}")
```

#### 3. Test Celery Task
```bash
# Check Celery tasks
celery -A services.celery_tasks inspect active

# Purge queue (for testing)
celery -A services.celery_tasks purge
```

---

## 6. Common Integration Patterns

### Pattern 1: Notify on Appointment Creation
```python
# In backend/routers/consultations.py

from services.notification_service import NotificationService
from schemas.notifications import NotificationCreateRequest, NotificationType

@router.post("/appointments/")
async def create_appointment(
    appointment: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Create appointment
    new_appointment = Appointment(...)
    db.add(new_appointment)
    db.commit()
    
    # Send notification
    notification_service = NotificationService(db)
    await notification_service.create_notification(
        organization_id=current_user.organization_id,
        create_request=NotificationCreateRequest(
            user_id=new_appointment.patient.user_id,  # or create one
            type=NotificationType.APPOINTMENT_CONFIRMED,
            title=f"Consulta com {current_user.name}",
            message=f"Sua consulta foi agendada para {appointment.date}",
            context_type="appointment",
            context_id=new_appointment.id,
            action_url=f"/appointments/{new_appointment.id}",
            data={
                "doctor_name": current_user.name,
                "appointment_date": appointment.date.isoformat(),
                "appointment_time": appointment.time.isoformat(),
            }
        ),
        current_user_id=current_user.id
    )
    
    return new_appointment
```

### Pattern 2: Notify on Payment
```python
# In backend/routers/financial.py

@router.post("/payments/")
async def create_payment(
    payment: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_payment = Payment(...)
    db.add(new_payment)
    db.commit()
    
    # Send notification
    notification_service = NotificationService(db)
    await notification_service.create_notification(
        organization_id=current_user.organization_id,
        create_request=NotificationCreateRequest(
            user_id=payment.patient.user_id,
            type=NotificationType.PAYMENT_RECEIVED,
            title="Pagamento Recebido",
            message=f"Seu pagamento de R$ {payment.amount} foi confirmado",
            context_type="payment",
            context_id=new_payment.id,
            data={
                "amount": float(payment.amount),
                "date": payment.date.isoformat(),
            }
        ),
        current_user_id=current_user.id
    )
    
    return new_payment
```

### Pattern 3: Bulk Notification
```python
# Send to all patients in clinic

notification_service = NotificationService(db)

# Get all patients
patients = db.query(Patient).filter(
    Patient.organization_id == clinic_id
).all()

patient_user_ids = [p.user_id for p in patients]

# Create bulk notification request
bulk_request = BulkNotificationRequest(
    user_ids=patient_user_ids,
    type=NotificationType.CLINIC_ANNOUNCEMENT,
    title="Aviso Importante",
    message="Horário alterado na clínica",
    channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    scheduled_for=datetime.now() + timedelta(hours=1)
)

# Send bulk
await notification_service.create_bulk_notification(clinic_id, bulk_request)
```

---

## 7. Troubleshooting

### Issue: WebSocket Not Connecting

**Symptom:** Connection timeout, "Failed to establish WebSocket"

**Solution:**
```bash
# 1. Check backend is running
curl http://localhost:8000/docs

# 2. Check WebSocket endpoint
curl -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8000/notifications/ws?token=test

# 3. Check JWT token is valid
# Verify token in Redis/localStorage

# 4. Check CORS for WebSocket
# Add to main.py:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Emails Not Sending

**Symptom:** Notifications created but no emails received

**Solution:**
```bash
# 1. Check Celery worker is running
ps aux | grep celery

# 2. Check Celery task status
celery -A services.celery_tasks inspect active_queues

# 3. Check SendGrid API key
export SENDGRID_API_KEY=your_key
python -c "from sendgrid import SendGridAPIClient; SendGridAPIClient('test')"

# 4. Check Redis connection
redis-cli ping
# Should respond: PONG

# 5. Check email in logs
tail -f logs/celery.log
```

### Issue: High Latency

**Symptom:** Notifications delayed >500ms

**Solution:**
```bash
# 1. Check database query times
# Add query logging to SQLAlchemy:
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)

# 2. Check Redis response times
redis-cli --latency

# 3. Check WebSocket connections
celery -A services.celery_tasks inspect active

# 4. Monitor CPU/memory
htop

# 5. Add indexes if missing
CREATE INDEX idx_user_status ON notifications(user_id, status);
CREATE INDEX idx_user_created ON notifications(user_id, created_at);
```

---

## 8. API Reference (Quick)

### Create Notification
```bash
curl -X POST http://localhost:8000/notifications/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "type": "appointment_confirmed",
    "title": "Consulta Confirmada",
    "message": "Sua consulta foi confirmada",
    "channel": "in_app"
  }'
```

### List Notifications
```bash
curl http://localhost:8000/notifications/?skip=0&limit=20 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Mark as Read
```bash
curl -X PUT http://localhost:8000/notifications/123/read \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Preferences
```bash
curl http://localhost:8000/notifications/preferences \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update Preferences
```bash
curl -X PUT http://localhost:8000/notifications/preferences \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email_enabled": true,
    "email_frequency": "daily",
    "quiet_hours_enabled": true,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "08:00"
  }'
```

---

## 9. Key Files Location

| File | Purpose | Size |
|------|---------|------|
| `backend/models/notifications.py` | Database models | 450 lines |
| `backend/schemas/notifications.py` | Pydantic schemas | 350 lines |
| `backend/services/notification_service.py` | Business logic | 350 lines |
| `backend/services/websocket_manager.py` | Real-time connections | 150 lines |
| `backend/services/celery_tasks.py` | Async jobs | 200 lines |
| `backend/routers/notifications.py` | API endpoints | 350 lines |
| `frontend/lib/stores/notificationStore.ts` | State management | 350 lines |
| `frontend/hooks/useWebSocket.ts` | WebSocket hook | 150 lines |
| `frontend/components/NotificationCenter.tsx` | UI component | 300 lines |
| `frontend/app/notifications/page.tsx` | Notifications page | 200 lines |
| `frontend/app/notifications/preferences/page.tsx` | Preferences page | 300 lines |

**Total: ~3,700 lines of code**

---

## 10. Next Steps

1. **Now:** Copy files from NOTIFICATION_SYSTEM_DESIGN.md
2. **In 1 hour:** Basic CRUD working
3. **In 2 hours:** WebSocket connecting
4. **In 4 hours:** Full system functional
5. **In 6-8 hours:** Testing & deployment ready

---

## 11. Support & References

- **Design Doc:** `NOTIFICATION_SYSTEM_DESIGN.md`
- **Roadmap:** `NOTIFICATION_IMPLEMENTATION_ROADMAP.md`
- **FastAPI Docs:** http://localhost:8000/docs
- **WebSocket Debugging:** Use `wscat` tool
- **Celery Monitoring:** Use `flower` web UI (`pip install flower`)

**Start Flower:**
```bash
celery -A services.celery_tasks flower --port=5555
# Open http://localhost:5555
```

---

## 12. Success Checklist

Before going to production:

- [ ] All 9 API endpoints working
- [ ] WebSocket latency <500ms
- [ ] Email sending consistently
- [ ] Push notifications working
- [ ] Quiet hours enforced
- [ ] User preferences saving
- [ ] Unread count accurate
- [ ] No console errors
- [ ] All tests passing (80%+ coverage)
- [ ] Documentation complete
- [ ] Performance monitored

---

**You're ready to build! Start with Day 1 tasks in NOTIFICATION_IMPLEMENTATION_ROADMAP.md**

