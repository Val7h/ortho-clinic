"""Serviço de envio de mensagens WhatsApp via Evolution API."""
import os
import re
import httpx
from datetime import datetime, timezone

EVOLUTION_URL = os.getenv("EVOLUTION_API_URL", "").rstrip("/")
EVOLUTION_KEY = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_DEFAULT_INSTANCE = os.getenv("EVOLUTION_INSTANCE", "cto-geral")
DOCTOR_NAME = os.getenv("DOCTOR_NAME", "Dr. Ortopedista")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://ortho-frontend.onrender.com")


def is_demo() -> bool:
    """Retorna True se Evolution API não estiver configurada."""
    return not EVOLUTION_URL or not EVOLUTION_KEY


def format_phone(phone: str) -> str:
    """Converte telefone brasileiro para formato Evolution API: 5511999999999"""
    digits = re.sub(r"\D", "", phone)
    if not digits.startswith("55"):
        digits = "55" + digits
    return digits


def send_whatsapp(phone: str, message: str, instance: str | None = None) -> dict:
    """
    Envia mensagem via Evolution API.
    Retorna {"sent": True/False, "demo": True/False, "error": ...}
    """
    if is_demo():
        print(f"[WA DEMO] -> {phone}: {message[:60]}...")
        return {"sent": False, "demo": True}

    instance = instance or EVOLUTION_DEFAULT_INSTANCE
    url = f"{EVOLUTION_URL}/message/sendText/{instance}"
    headers = {"apikey": EVOLUTION_KEY, "Content-Type": "application/json"}
    body = {
        "number": format_phone(phone),
        "text": message,
        "delay": 1200,
    }

    try:
        r = httpx.post(url, json=body, headers=headers, timeout=10)
        r.raise_for_status()
        return {"sent": True, "demo": False}
    except httpx.HTTPStatusError as e:
        print(f"[WA ERROR] HTTP {e.response.status_code}: {e.response.text}")
        return {"sent": False, "demo": False, "error": str(e)}
    except Exception as e:
        print(f"[WA ERROR] {e}")
        return {"sent": False, "demo": False, "error": str(e)}


# ── Mensagem de confirmação de agendamento ────────────────────────────────────

DOW_PT = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun",
              "jul", "ago", "set", "out", "nov", "dez"]


def fmt_date(d) -> str:
    """2025-06-05 → 'Quinta, 5 jun'"""
    from datetime import date as d_type
    if isinstance(d, str):
        from datetime import date
        d = date.fromisoformat(d)
    dow = d.weekday()
    return f"{DOW_PT[dow]}, {d.day} {MONTHS_PT[d.month - 1]}"


def build_booking_message(
    patient_name: str,
    clinic_name: str,
    clinic_city: str,
    appt_date,
    start_time: str,
    end_time: str,
    confirmation_token: str,
    queue_number: int | None = None,
    schedule_type: str = "appointment",
) -> str:
    first_name = patient_name.split()[0]
    date_str = fmt_date(appt_date)
    link = f"{FRONTEND_URL}/confirmar/{confirmation_token}"

    if schedule_type == "walk_in":
        hora_info = f"Turno {start_time}–{end_time} | Senha #{queue_number}"
    else:
        hora_info = f"{start_time} – {end_time}"

    return (
        f"Olá, {first_name}! 👋\n\n"
        f"Seu agendamento foi registrado com sucesso:\n"
        f"📍 *{clinic_name}* — {clinic_city}\n"
        f"📅 {date_str}\n"
        f"🕐 {hora_info}\n\n"
        f"Confirme ou cancele sua presença:\n"
        f"👉 {link}\n\n"
        f"— {DOCTOR_NAME}"
    )


def build_reminder_message(
    patient_name: str,
    clinic_name: str,
    appt_date,
    start_time: str,
    confirmation_token: str,
    queue_number: int | None = None,
    schedule_type: str = "appointment",
) -> str:
    first_name = patient_name.split()[0]
    date_str = fmt_date(appt_date)
    link = f"{FRONTEND_URL}/confirmar/{confirmation_token}"

    if schedule_type == "walk_in":
        hora_info = f"Turno {start_time} | Senha #{queue_number}"
    else:
        hora_info = start_time

    return (
        f"Olá, {first_name}! ⏰\n\n"
        f"Lembrete: sua consulta em *{clinic_name}* é *amanhã*.\n"
        f"📅 {date_str} às {hora_info}\n\n"
        f"Confirme sua presença:\n"
        f"👉 {link}\n\n"
        f"— {DOCTOR_NAME}"
    )
