from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class WhatsAppMessageOut(BaseModel):
    id: int
    patient_id: int
    phone: Optional[str] = None
    message_type: str
    message_text: str
    status: str
    demo: bool
    sent_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SendMessageIn(BaseModel):
    patient_id: int
    message_type: str
    custom_text: Optional[str] = None
    # For return_reminder, caller can pass the appointment date
    appointment_date: Optional[str] = None
    consultation_date: Optional[str] = None
