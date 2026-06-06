# OrthoClinic Queue API - Quick Reference

## Endpoints Summary

All endpoints prefixed with `/api/clinic/`

### Queue Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/queue/call` | Call next patient to room |
| GET | `/queue/status` | Get current queue status |
| GET | `/queue/history` | Get queue call history |
| PATCH | `/queue/{queue_id}` | Update queue entry status |
| WS | `/ws/clinic/{clinic_id}/queue` | WebSocket real-time updates |

### Prescription Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/prescription/validate` | Validate medications for interactions |
| POST | `/prescription/sign` | Create digital signature request |
| GET | `/prescription/{prescription_id}/signatures` | Get signatures for prescription |

### Anamnesis Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/anamnesis-template` | Create new template |
| GET | `/anamnesis-templates` | List templates (filterable) |
| GET | `/anamnesis-template/{template_id}` | Get specific template |
| PATCH | `/anamnesis-template/{template_id}` | Update template |
| DELETE | `/anamnesis-template/{template_id}` | Delete template |

## Common Payloads

### Call Patient
```json
POST /api/clinic/queue/call

{
  "appointment_id": 123,
  "patient_id": 456,
  "room": "Sala 1",
  "clinic_id": 1
}
```

### Get Queue Status
```json
GET /api/clinic/queue/status?clinic_id=1

Response:
{
  "clinic_id": 1,
  "current": {
    "id": 1,
    "appointment_id": 123,
    "patient_id": 456,
    "patient_name": "João Silva",
    "room": "Sala 1",
    "status": "called",
    "created_at": "2026-06-05T10:25:00Z",
    "called_at": "2026-06-05T10:30:45Z"
  },
  "next": [...],
  "waiting_count": 3,
  "last_called_at": "2026-06-05T10:30:45Z"
}
```

### Queue Statuses
- `pending` - Arrived, waiting
- `called` - Called to room
- `arrived` - In room
- `in_consultation` - In consultation
- `completed` - Consultation finished

### Validate Medications
```json
POST /api/clinic/prescription/validate

{
  "medicamentos": [
    {"drug_name": "Warfarin", "dosage": "5mg", "frequency": "1x ao dia"},
    {"drug_name": "Aspirin", "dosage": "100mg", "frequency": "1x ao dia"}
  ],
  "patient_id": 456
}

Response:
{
  "valid": false,
  "interactions": [
    {
      "severity": "high",
      "drug1": "Warfarin",
      "drug2": "Aspirin",
      "description": "Increased bleeding risk",
      "recommendation": "Monitor INR closely"
    }
  ],
  "warnings": [],
  "contraindications": []
}
```

## Database Tables

### clinic_queue
```
id              - Primary key
clinic_id       - Clinic reference
appointment_id  - Appointment reference
patient_id      - Patient reference
room            - Room/location (e.g., "Sala 1")
called_at       - Timestamp when called
called_by_user_id - User who called
status          - pending|called|arrived|in_consultation|completed
created_at      - Record creation time
updated_at      - Last update time
```

### prescription_signatures
```
id                  - Primary key
prescription_id     - Prescription reference
clicksign_doc_id    - External service ID
signed_at           - Signature timestamp
signature_proof     - JSON metadata
status              - pending|signed|failed
created_at          - Record creation time
updated_at          - Last update time
```

### anamnesis_templates
```
id          - Primary key
clinic_id   - Clinic reference
name        - Template name
specialty   - Medical specialty (ortopedia, general, etc.)
structure   - JSON template structure
created_by  - User who created
created_at  - Record creation time
updated_at  - Last update time
```

### patients (enhanced)
```
...existing fields...
alergias                    - Allergies text
medicacoes_uso_continuo     - JSON list of medications
contraindicacoes            - Contraindications text
peso_kg                     - Weight in kg
altura_cm                   - Height in cm
comorbidades                - JSON comorbidities object
```

## Python Usage

### Import Models
```python
from models.queue import ClinicQueue, PrescriptionSignature, AnamnesisTemplate
from schemas.queue import QueueCallRequest, QueueStatus
from services.queue_service import QueueService, PrescriptionService
```

### Use Services
```python
from services.queue_service import QueueService
from database import SessionLocal

db = SessionLocal()

# Get queue count
count = QueueService.get_queue_count(clinic_id=1, db=db)

# Get next patient
next_patient = QueueService.get_next_patient(clinic_id=1, db=db)

# Get stats
stats = QueueService.get_clinic_stats(clinic_id=1, db=db)
print(f"Pending: {stats['pending']}")
print(f"Current: {stats['current']}")
print(f"Avg wait: {stats['avg_wait_minutes']} min")
```

## JavaScript/TypeScript Usage

### REST API
```javascript
// Call patient
const response = await fetch('/api/clinic/queue/call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appointment_id: 123,
    patient_id: 456,
    room: 'Sala 1',
    clinic_id: 1
  })
});
const result = await response.json();
console.log(result.status); // "called"

// Get status
const statusResponse = await fetch('/api/clinic/queue/status?clinic_id=1');
const status = await statusResponse.json();
console.log(`Waiting: ${status.waiting_count}`);
```

### WebSocket
```javascript
const ws = new WebSocket('ws://localhost:8000/api/clinic/ws/clinic/1/queue');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'initial_status') {
    console.log('Queue status:', message.data);
  } else if (message.type === 'patient_called') {
    console.log(`Patient ${message.data.patient_name} called to ${message.data.room}`);
  } else if (message.type === 'status_change') {
    console.log(`Status changed to: ${message.data.status}`);
  }
};

// Keep alive
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

## React Hook Example

```tsx
import { useEffect, useState } from 'react';

export function useQueueStatus(clinicId) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ws = new WebSocket(
      `ws://localhost:8000/api/clinic/ws/clinic/${clinicId}/queue`
    );

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'initial_status' || msg.type === 'queue_update') {
        setStatus(msg.data);
      }
    };

    ws.onerror = (event) => setError('WebSocket error');

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [clinicId]);

  return { status, error };
}

// Usage
function QueuePanel() {
  const { status, error } = useQueueStatus(1);

  if (error) return <div className="error">{error}</div>;
  if (!status) return <div>Loading...</div>;

  return (
    <div className="queue">
      <div className="waiting">Esperando: {status.waiting_count}</div>
      {status.current && (
        <div className="current">
          {status.current.patient_name} → {status.current.room}
        </div>
      )}
      <div className="next">
        {status.next.slice(0, 3).map(item => (
          <div key={item.id}>{item.patient_name}</div>
        ))}
      </div>
    </div>
  );
}
```

## Error Handling

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `204` - No Content (delete)
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Server Error

### Example Error Response
```json
{
  "detail": "Clinic not found"
}
```

### WebSocket Close Codes
- `1000` - Normal closure
- `1002` - Protocol error
- `1006` - Abnormal closure

## Performance Tips

1. **Limit history queries** - Use `hours=8` parameter to reduce load
2. **Batch status checks** - Don't poll faster than 5 seconds
3. **Use WebSocket** - More efficient than polling
4. **Index by clinic_id** - Always filter by clinic
5. **Pagination** - History endpoint uses limit, default 50

## Security Notes

- All endpoints protected by clinic_id isolation
- WebSocket requires valid clinic_id
- Future: Add authentication tokens
- Future: Add role-based access control

## Debugging

### Check logs
```bash
tail -f /var/log/orthoclinic.log
```

### Test endpoint
```bash
curl -X GET "http://localhost:8000/api/clinic/queue/status?clinic_id=1"
```

### WebSocket test
```bash
# Using websocat (install first)
websocat ws://localhost:8000/api/clinic/ws/clinic/1/queue
```

## Migrations

### Check if tables exist
```python
from database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
tables = inspector.get_table_names()
print('clinic_queue' in tables)  # Should be True
```

### Manual migration
```python
from database import migrate_db
migrate_db()  # Run on startup
```

## Files Reference

| File | Purpose |
|------|---------|
| `models/queue.py` | SQLAlchemy models |
| `schemas/queue.py` | Pydantic validation |
| `routers/queue.py` | FastAPI endpoints |
| `services/queue_service.py` | Business logic |
| `migrations/20260605_*.py` | Database schema |
| `examples/queue_api_examples.py` | Usage examples |

## Links

- **Main Docs**: `QUEUE_IMPLEMENTATION_GUIDE.md`
- **Implementation**: `IMPLEMENTATION_SUMMARY.md`
- **API Docs**: `http://localhost:8000/docs` (Swagger)
- **Examples**: `backend/examples/queue_api_examples.py`

---

**Last Updated**: June 5, 2026
**Version**: 1.0.0
