"""Serviço de envio de mensagens WhatsApp via Evolution API."""
import logging
import os
import re
import httpx
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

EVOLUTION_URL = os.getenv("EVOLUTION_API_URL", "").rstrip("/")
EVOLUTION_KEY = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_DEFAULT_INSTANCE = os.getenv("EVOLUTION_INSTANCE", "cto-geral")
DOCTOR_NAME = os.getenv("DOCTOR_NAME", "Dr. Ortopedista")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://ortho-frontend.onrender.com")


def is_demo() -> bool:
    """Retorna True se Evolution API não estiver configurada."""
    return not EVOLUTION_URL or not EVOLUTION_KEY


def _mask_phone(phone: str) -> str:
    """Mascara telefone para log: mantém só os últimos 4 dígitos (B4/LGPD)."""
    digits = re.sub(r"\D", "", phone or "")
    return f"****{digits[-4:]}" if len(digits) >= 4 else "****"


def format_phone(phone: str) -> str:
    """Converte telefone brasileiro para o formato Evolution API (5511999999999).

    M19: valida o tamanho antes de prefixar o país. O bug antigo era só olhar
    se começava com '55' — um número NACIONAL de DDD 55 (RS), ex. 5599XXXXXXX,
    já começa com '55' e ficava sem o código do país. Regras por tamanho:
    - 10 dígitos (DDD + fixo) ou 11 (DDD + celular com 9): prefixa '55'.
    - 12 (55 + 10) ou 13 (55 + 11) começando com '55': já tem país, mantém.
    - Qualquer outro tamanho: devolve só os dígitos, sem forçar '55'
      (número malformado — melhor não inventar um código de país).
    """
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) in (10, 11):
        return "55" + digits
    if len(digits) in (12, 13) and digits.startswith("55"):
        return digits
    return digits


def send_whatsapp(phone: str, message: str, instance: str | None = None) -> dict:
    """
    Envia mensagem via Evolution API.
    Retorna {"sent": True/False, "demo": True/False, "error": ...}
    """
    if is_demo():
        # B4: nunca logar telefone cru nem o corpo da mensagem (dado clínico/PII).
        logger.info("[WA DEMO] mensagem para %s não enviada (modo demo, %d caracteres)",
                    _mask_phone(phone), len(message or ""))
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
        # B4: não logar e.response.text bruto (pode conter dado clínico/PII) nem
        # o telefone cru — só o status e o telefone mascarado.
        status = e.response.status_code
        logger.error("[WA ERROR] HTTP %s ao enviar para %s", status, _mask_phone(phone))
        return {"sent": False, "demo": False, "error": f"HTTP {status}"}
    except Exception as e:
        logger.error("[WA ERROR] %s ao enviar para %s", type(e).__name__, _mask_phone(phone))
        return {"sent": False, "demo": False, "error": type(e).__name__}


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
