"""Fuso horário do consultório (Brasil).

O servidor (Render) roda em UTC. Usar `date.today()`/`datetime.now()` puro faz o
"hoje" virar o dia seguinte a partir das 21h no horário de Brasília (UTC-3),
derrubando a fila de espera e a agenda no meio do expediente noturno.

O Brasil não tem horário de verão desde 2019, então um offset fixo de UTC-3
cobre PB/PE (e o país todo, exceto o fuso do Acre/AM-oeste) sem depender de
tzdata. Se um dia o app precisar suportar clínicas em outros fusos, dá para
trocar por `zoneinfo.ZoneInfo(organization.timezone)`.
"""
from datetime import date, datetime, timedelta, timezone

BR_TZ = timezone(timedelta(hours=-3))  # America/Sao_Paulo (sem DST desde 2019)


def now_br() -> datetime:
    """Agora, no fuso do consultório (tz-aware)."""
    return datetime.now(BR_TZ)


def today_br() -> date:
    """A data de 'hoje' no fuso do consultório."""
    return now_br().date()
