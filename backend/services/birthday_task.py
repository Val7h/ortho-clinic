"""Envio AUTOMÁTICO diário de parabéns de aniversário (pedido Valth 02/08).

Loop em background (inicia no startup do FastAPI): a cada 30 min, entre
09h e 19h de Brasília, procura pacientes ativos fazendo aniversário HOJE
e envia a mensagem de parabéns pelo WhatsApp — no máximo 1 por paciente
por ano (dedup pela tabela whatsapp_messages). Falha de envio tenta de
novo no ciclo seguinte do mesmo dia, no máximo 2 tentativas no dia.
Teto de 20 envios por dia, com 20 a 40 s entre eles (revisão 19/11).

Sem Evolution configurada (modo demo) o loop não faz nada — nunca grava
registros fantasma.
"""

import asyncio
import logging
import random
import time
from datetime import date, datetime, timedelta, timezone

logger = logging.getLogger("orthoclinic.birthday")

CHECK_INTERVAL_S = 30 * 60
SEND_HOUR_START = 9    # BRT
SEND_HOUR_END = 19     # BRT (exclusivo)
BRT = timezone(timedelta(hours=-3))

# Revisão 19/11: o número da clínica foi restringido por rajada (30/10). Parabéns
# saem no máximo 20 por dia, com 20 a 40 s entre um e outro. Quem não couber
# não recebe naquele dia (o log diz quantos ficaram).
MAX_POR_DIA = 20
INTERVALO_MIN_S = 20
INTERVALO_MAX_S = 40
# Falha de verdade tenta no máximo 2 vezes no dia (antes: a cada 30 min, o dia todo).
MAX_TENTATIVAS_DIA = 2
_dormir = time.sleep   # trocado nos testes


def _send_todays_birthdays() -> None:
    # Imports locais: evita ciclo de import no startup
    from database import SessionLocal
    from models.patient import Patient
    from models.whatsapp import WhatsAppMessage
    from routers.whatsapp import TEMPLATES
    from services.whatsapp import DOCTOR_NAME, is_demo, send_whatsapp, status_envio

    if is_demo():
        return

    agora_brt = datetime.now(BRT)
    today_brt = agora_brt.date()
    inicio_dia = datetime(today_brt.year, today_brt.month, today_brt.day, tzinfo=BRT).astimezone(timezone.utc)
    db = SessionLocal()
    try:
        patients = (
            db.query(Patient)
            .filter(Patient.active == True, Patient.birthdate.isnot(None), Patient.phone.isnot(None))
            .order_by(Patient.id)
            .all()
        )
        # Envios já feitos HOJE (qualquer resultado conta para o teto)
        enviados_hoje = (
            db.query(WhatsAppMessage)
            .filter(WhatsAppMessage.message_type == "birthday", WhatsAppMessage.sent_at >= inicio_dia)
            .count()
        )
        year_start = datetime(today_brt.year, 1, 1, tzinfo=timezone.utc)
        fila = []
        for p in patients:
            bd: date = p.birthdate
            if (bd.month, bd.day) != (today_brt.month, today_brt.day):
                continue
            # Dedup: já recebeu parabéns ESTE ANO? ("incerto" = a Evolution recebeu o
            # pedido sem responder a tempo; conta como enviado, não repete)
            ja_enviou = (
                db.query(WhatsAppMessage)
                .filter(
                    WhatsAppMessage.patient_id == p.id,
                    WhatsAppMessage.message_type == "birthday",
                    WhatsAppMessage.status.in_(["sent", "incerto"]),
                    WhatsAppMessage.created_at >= year_start,
                )
                .first()
            )
            if ja_enviou:
                continue
            falhas_hoje = (
                db.query(WhatsAppMessage)
                .filter(
                    WhatsAppMessage.patient_id == p.id,
                    WhatsAppMessage.message_type == "birthday",
                    WhatsAppMessage.sent_at >= inicio_dia,
                )
                .count()
            )
            if falhas_hoje >= MAX_TENTATIVAS_DIA:
                continue
            fila.append(p)

        vagas = max(0, MAX_POR_DIA - enviados_hoje)
        if len(fila) > vagas:
            logger.warning("Parabéns: teto de %d por dia; %d ficaram sem envio hoje",
                           MAX_POR_DIA, len(fila) - vagas)
        for i, p in enumerate(fila[:vagas]):
            if i > 0:
                _dormir(random.uniform(INTERVALO_MIN_S, INTERVALO_MAX_S))
            text = TEMPLATES["birthday"].format(nome=p.name.split()[0].title(), doctor=DOCTOR_NAME)
            result = send_whatsapp(p.phone, text)
            status = status_envio(result)
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
