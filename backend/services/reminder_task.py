"""WhatsApp AUTOMÁTICO dos lembretes de repetição de procedimento (Valth, 12/11/2026:
"É para ficar automático. Quando eu boto 5 meses, 6 meses, 11 meses, tem que sair
automaticamente o WhatsApp").

O médico aperta "Lembrar retorno" na consulta e escolhe o prazo (tabela
procedure_reminders). Este loop, no mesmo molde do parabéns de aniversário
(services/birthday_task.py), manda a mensagem SOZINHO pelo WhatsApp da clínica:

  1º toque: faltando 30 dias ou menos para vencer
  2º toque: faltando 7 dias ou menos

Cada toque sai UMA vez por lembrete (dedup em whatsapp_messages pelo
message_type "lembrete_<id>_30" / "lembrete_<id>_7"). Falha de envio tenta de novo
no ciclo seguinte. Lembrete já vencido não recebe mensagem (fica na página
Retornos para a secretária). Só lembrete "pending" e paciente ativo com telefone.

A página Retornos continua igual: a secretária vê quem foi avisado e marca
"feito" ou "não repetir".

Sem Evolution configurada (modo demo) não faz nada.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("orthoclinic.lembretes")

CHECK_INTERVAL_S = 30 * 60
SEND_HOUR_START = 9    # BRT
SEND_HOUR_END = 18     # BRT (exclusivo): mensagem a paciente só em horário comercial
BRT = timezone(timedelta(hours=-3))

TOQUE_1_DIAS = 30
TOQUE_2_DIAS = 7

# Clínica de alto padrão: sem carinha nem coração. Só a seringa no procedimento (Valth, 12/11/2026).
TEXTO_TOQUE_1 = (
    "Olá, {nome}. Tudo bem?\n"
    "Aqui é da equipe do {doctor}.\n\n"
    "💉 Passando para lembrar que a sua {procedimento_explicado} "
    "está chegando na data de repetir: *{vence}*.\n\n"
    "Para manter o resultado, o ideal é não passar desse prazo. "
    "Quer que a gente já reserve um horário para você? É só responder aqui."
)

TEXTO_TOQUE_2 = (
    "Olá, {nome}.\n"
    "Aqui é da equipe do {doctor}.\n\n"
    "💉 Faltam poucos dias para a data de repetir a sua {procedimento_explicado}: *{vence}*.\n\n"
    "Ainda dá tempo de agendar: responda esta mensagem que a gente encaixa você."
)

TEXTO_RETORNO_1 = (
    "Olá, {nome}. Tudo bem?\n"
    "Aqui é da equipe do {doctor}.\n\n"
    "Passando para lembrar que está chegando a data do seu retorno de acompanhamento "
    "com o {doctor}: *{vence}*.\n\n"
    "Quer que a gente já reserve um horário para você? É só responder aqui."
)

TEXTO_RETORNO_2 = (
    "Olá, {nome}.\n"
    "Aqui é da equipe do {doctor}.\n\n"
    "Faltam poucos dias para a data do seu retorno de acompanhamento: *{vence}*.\n\n"
    "Ainda dá tempo de agendar: responda esta mensagem que a gente encaixa você."
)


def _fmt(d) -> str:
    return d.strftime("%d/%m/%Y")


def _local(texto: str) -> str:
    t = texto.lower()
    if "joelhos" in t or ("joelho" in t and ("bilateral" in t or "direito e esquerdo" in t)):
        return " nos dois joelhos"
    for parte, dito in (("joelho", "no joelho"), ("ombro", "no ombro"), ("quadril", "no quadril"),
                        ("tornozelo", "no tornozelo"), ("coluna", "na coluna")):
        if parte in t:
            return " " + dito
    return ""


def explicar_procedimento(procedimento: str, notas: str, aplicado) -> str:
    """O paciente não sabe o que é "viscossuplementação" (Valth 12/11): diz o nome E o que foi
    feito, com a data. Ex.: "*viscossuplementação com ácido hialurônico* (a infiltração que
    você fez no joelho em 12/11/2026)". Nunca cita marca."""
    p = (procedimento or "").strip()
    base = f"{p} {notas or ''}"   # local (joelho, ombro...) pode vir do registro do dia
    b = p.lower()                   # O TIPO vem só do nome do lembrete
    data = _fmt(aplicado)
    if "visco" in b or "hialur" in b:
        return f"*viscossuplementação com ácido hialurônico* (a infiltração que você fez{_local(base)} em {data})"
    if "zoled" in b:
        return f"*aplicação de ácido zoledrônico* (o remédio na veia para fortalecer os ossos, que você tomou em {data})"
    if "prp" in b or "plasma" in b:
        return f"*aplicação de PRP, o plasma rico em plaquetas* (a infiltração que você fez{_local(base)} em {data})"
    return None   # não é procedimento conhecido: usa o texto genérico de retorno


def montar_texto(toque: int, nome: str, procedimento: str, aplicado, vence, doctor: str, notas: str = "") -> str:
    explicado = explicar_procedimento(procedimento, notas, aplicado)
    if explicado is None:
        # RX, RNM de controle, retorno, nódulo... não cita o assunto (pode ser sensível)
        modelo = TEXTO_RETORNO_1 if toque == TOQUE_1_DIAS else TEXTO_RETORNO_2
    else:
        modelo = TEXTO_TOQUE_1 if toque == TOQUE_1_DIAS else TEXTO_TOQUE_2
    return modelo.format(
        nome=(nome or "").split()[0].title() if nome else "",
        doctor=doctor,
        procedimento_explicado=explicado,
        vence=_fmt(vence),
    )


def toque_devido(dias_para_vencer: int, prazo_total: int = 9999):
    """Qual toque cabe hoje (30, 7) ou None. Vencido (<=0) não recebe.
    17/11 (Valth): prazo curto em dias. Prazo até ~5 semanas não leva o aviso de 1 mês;
    prazo de até 7 dias só leva 1 aviso, na véspera."""
    if dias_para_vencer <= 0:
        return None
    if prazo_total <= TOQUE_2_DIAS:
        return TOQUE_2_DIAS if dias_para_vencer <= 1 else None
    if prazo_total <= TOQUE_1_DIAS + TOQUE_2_DIAS and dias_para_vencer > TOQUE_2_DIAS:
        return None
    if dias_para_vencer <= TOQUE_2_DIAS:
        return TOQUE_2_DIAS
    if dias_para_vencer <= TOQUE_1_DIAS:
        return TOQUE_1_DIAS
    return None


def _enviar_lembretes_devidos() -> None:
    from database import SessionLocal
    from models.clinical_evolution import ClinicalEvolution
    from models.patient import Patient
    from models.procedure_reminder import ProcedureReminder
    from models.whatsapp import WhatsAppMessage
    from routers.procedure_reminders import vencimento, prazo_em_dias
    from services.whatsapp import DOCTOR_NAME, is_demo, send_whatsapp

    if is_demo():
        return

    hoje = datetime.now(BRT).date()
    db = SessionLocal()
    try:
        pares = (
            db.query(ProcedureReminder, Patient)
            .join(Patient, Patient.id == ProcedureReminder.patient_id)
            .filter(
                ProcedureReminder.status == "pending",
                Patient.active == True,  # noqa: E712
                Patient.phone.isnot(None),
            )
            .all()
        )
        for r, p in pares:
            vence = vencimento(r)
            toque = toque_devido((vence - hoje).days, prazo_em_dias(r))
            if toque is None:
                continue
            tipo = f"lembrete_{r.id}_{toque}"
            ja = (
                db.query(WhatsAppMessage)
                .filter(
                    WhatsAppMessage.patient_id == p.id,
                    WhatsAppMessage.message_type.in_([tipo, f"lembrete_{r.id}_{TOQUE_2_DIAS}"]),
                    WhatsAppMessage.status == "sent",
                )
                .first()
            )
            # Já mandou este toque, ou já mandou o 2º (então o 1º não faz mais sentido)
            if ja:
                continue
            evo = " ".join(
                (e.content or "") for e in db.query(ClinicalEvolution).filter(
                    ClinicalEvolution.patient_id == p.id, ClinicalEvolution.entry_date == r.applied_on)
            )
            texto = montar_texto(toque, p.name, r.procedure, r.applied_on, vence, DOCTOR_NAME,
                                 f"{r.notes or ''} {evo}")
            res = send_whatsapp(p.phone, texto)
            status = "sent" if res.get("sent") else "failed"
            db.add(WhatsAppMessage(
                patient_id=p.id,
                organization_id=p.organization_id,
                phone=p.phone,
                message_type=tipo,
                message_text=texto,
                status=status,
                demo=False,
                sent_at=datetime.now(timezone.utc),
            ))
            db.commit()
            logger.info("Lembrete automático %s (paciente %s): %s", tipo, p.id, status)
    finally:
        db.close()


async def reminder_loop() -> None:
    logger.info("Loop de lembretes automáticos iniciado (09-18h BRT, ciclo 30min)")
    while True:
        try:
            hora = datetime.now(BRT).hour
            if SEND_HOUR_START <= hora < SEND_HOUR_END:
                await asyncio.to_thread(_enviar_lembretes_devidos)
        except Exception:
            logger.exception("Erro no ciclo de lembretes (segue no próximo)")
        await asyncio.sleep(CHECK_INTERVAL_S)
