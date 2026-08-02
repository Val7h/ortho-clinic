"""Envio AUTOMÁTICO diário de parabéns de aniversário (pedido Valth 02/08).

Loop em background (inicia no startup do FastAPI): a cada 30 min, entre
09h e 19h de Brasília, procura pacientes ativos fazendo aniversário HOJE
e envia a mensagem de parabéns pelo WhatsApp — no máximo 1 por paciente
por ano (dedup pela tabela whatsapp_messages). Falha de envio tenta de
novo no ciclo seguinte do mesmo dia.

Sem Evolution configurada (modo demo) o loop não faz nada — nunca grava
registros fantasma.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

logger = logging.getLogger("orthoclinic.birthday")

CHECK_INTERVAL_S = 30 * 60
SEND_HOUR_START = 9    # BRT
SEND_HOUR_END = 19     # BRT (exclusivo)
BRT = timezone(timedelta(hours=-3))


def _send_todays_birthdays() -> None:
    # Imports locais: evita ciclo de import no startup
    from database import SessionLocal
    from models.patient import Patient
    from models.whatsapp import WhatsAppMessage
    from routers.whatsapp import TEMPLATES
    from services.whatsapp import DOCTOR_NAME, is_demo, send_whatsapp

    if is_demo():
        return

    today_brt = datetime.now(BRT).date()
    db = SessionLocal()
    try:
        patients = (
            db.query(Patient)
            .filter(Patient.active == True, Patient.birthdate.isnot(None), Patient.phone.isnot(None))
            .all()
        )
        for p in patients:
            bd: date = p.birthdate
            if (bd.month, bd.day) != (today_brt.month, today_brt.day):
                continue
            # Dedup: já recebeu parabéns ESTE ANO? (sent cobre o ano todo;
            # falha de hoje pode tentar de novo no próximo ciclo)
            year_start = datetime(today_brt.year, 1, 1, tzinfo=timezone.utc)
            ja_enviou = (
                db.query(WhatsAppMessage)
                .filter(
                    WhatsAppMessage.patient_id == p.id,
                    WhatsAppMessage.message_type == "birthday",
                    WhatsAppMessage.status == "sent",
                    WhatsAppMessage.created_at >= year_start,
                )
                .first()
            )
            if ja_enviou:
                continue

            text = TEMPLATES["birthday"].format(nome=p.name.split()[0].title(), doctor=DOCTOR_NAME)
            result = send_whatsapp(p.phone, text)
            status = "sent" if result.get("sent") else "failed"
            db.add(WhatsAppMessage(
                patient_id=p.id,
                organization_id=p.organization_id,
                phone=p.phone,
                message_type="birthday",
                message_text=text,
                status=status,
                demo=False,
                sent_at=datetime.now(timezone.utc),
            ))
            db.commit()
            logger.info("Parabéns automático p/ paciente %s: %s", p.id, status)
    finally:
        db.close()


async def birthday_loop() -> None:
    logger.info("Loop de aniversários automático iniciado (09-19h BRT, ciclo 30min)")
    while True:
        try:
            hour_brt = datetime.now(BRT).hour
            if SEND_HOUR_START <= hour_brt < SEND_HOUR_END:
                await asyncio.to_thread(_send_todays_birthdays)
        except Exception:
            logger.exception("Erro no ciclo de aniversários (segue no próximo)")
        await asyncio.sleep(CHECK_INTERVAL_S)
