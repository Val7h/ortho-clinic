"""EMISSOR UNICO DE DOCUMENTOS (27/11/2026, P3 do plano aprovado pelo Valth).

O bug de 27/11: dois geradores (o "Tudo de hoje" pela ponte e a sessao no PC) fizeram a MESMA guia, porque cada um
conferia "ja existe hoje?" e so depois gravava (confere-e-age). Aqui o "confere e reserva" e atomico:

1. RESERVAR (POST /emissor/reservar): o servidor calcula a chave de cada item (services/regua.py), e DENTRO DA FILA DO
   PACIENTE (trava em memoria + pg_advisory_xact_lock no Postgres) compara por significado com o que ja esta reservado,
   pronto, ou ja gravado hoje por qualquer mao (a tela, inclusive). Novo -> grava a reserva (lote + token). Ja existe ->
   devolve o documento e a hora. Em andamento -> diz quem esta fazendo. O indice unico parcial do banco e a trava dura
   de reserva (mesmo que a fila falhe, a mesma chave exata nunca fica ativa duas vezes).
2. GRAVAR: as rotas de sempre (receita, exame, laudo/encaminhamento/atestado, fisio, upload da guia) com o cabecalho
   X-Emissor-Lote: lote:token. Cria o documento e marca a reserva "pronto" NO MESMO COMMIT. Lote de outro, tomado ou
   ja falhado: 409, nada e criado. O mesmo lote gravado duas vezes devolve o MESMO documento. Sem o cabecalho, a rota
   fica exatamente como antes.
3. FALHOU libera a chave; RENOVAR estica o prazo; reserva vencida e assumida pelo proximo pedido (token novo: o dono
   antigo leva 409 ao gravar).

Troca (decisao 1 do Valth, 27/11): remedio ja receitado so muda com a ordem "troca"/"nova" (ou troca=True): sai
documento novo e a chave antiga fica "substituido". Nunca se apaga nada. Sem a ordem: "ja existe, feito as HH:MM".
"""
from __future__ import annotations

import hashlib
import re
import secrets
import threading
import unicodedata
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.emissor import ESTADOS_ATIVOS, EmissorChave
from services import regua as G
from tzutil import BR_TZ, today_br

PRAZO_DOC_S = 90          # receita, pedido, encaminhamento, atestado, justificativa
PRAZO_GUIA_S = 6 * 60     # guia: o PC leva ate 5 min no pior caso
MAX_ITENS_GUIA = 5        # a guia SP/SADT tem 5 linhas: 1 lote = 1 guia
ESPERA_FILA_S = 30
DONOS = {"sessao", "atendente", "escriba", "tela", "ponte"}
_RE_TROCA = re.compile(r"(?<![a-z])(troca|trocar|troque|nova|novo)(?![a-z])")


# ------------------------------------------------------------------ fila por paciente ---------------------------------
_GUARDA = threading.Lock()
_TRAVAS: dict = {}


def _trava_local(org: int, pid: int) -> threading.RLock:
    with _GUARDA:
        lk = _TRAVAS.get((org, pid))
        if lk is None:
            lk = _TRAVAS[(org, pid)] = threading.RLock()
        return lk


def _eh_postgres(db: Session) -> bool:
    try:
        return db.get_bind().dialect.name == "postgresql"
    except Exception:
        return False


def _chave_trava(org: int, pid: int) -> int:
    return int.from_bytes(hashlib.sha256(f"emissor:{org}:{pid}".encode()).digest()[:8], "big", signed=True)


USAR_TRAVA_LOCAL = True   # testes de Postgres desligam para provar que a trava do banco segura sozinha


@contextmanager
def fila_do_paciente(db: Session, org: int, pid: int):
    """Um "confere e reserva" (ou "grava") por paciente por vez. Em memoria (o Render tem 1 processo) e no Postgres
    por pg_advisory_xact_lock (vale entre processos e com o pool do Neon: e trava de TRANSACAO, solta no commit).
    Nada de rede aqui dentro. Ao sair, a transacao termina antes de soltar a trava local."""
    lk = _trava_local(org, pid) if USAR_TRAVA_LOCAL else None
    if lk is not None and not lk.acquire(timeout=ESPERA_FILA_S):
        raise HTTPException(503, "Outro documento deste paciente está sendo gerado agora. Tente de novo.")
    try:
        if _eh_postgres(db):
            db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _chave_trava(org, pid)})
        yield
    finally:
        try:
            if db.in_transaction():
                db.rollback()   # o corpo ja fez commit do que valia; isto so solta a trava do banco
        finally:
            if lk is not None:
                lk.release()


# ------------------------------------------------------------------ utilidades ----------------------------------------
def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(d: Optional[datetime]) -> Optional[datetime]:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def hora_br(d: Optional[datetime]) -> str:
    d = _utc(d)
    return d.astimezone(BR_TZ).strftime("%H:%M") if d else ""


def _dia_br(d: Optional[datetime]) -> Optional[date]:
    d = _utc(d)
    return d.astimezone(BR_TZ).date() if d else None


def _hash(conteudo: str) -> str:
    return hashlib.sha256((conteudo or "").encode("utf-8", "ignore")).hexdigest()


def _sem_acento(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", t or "") if not unicodedata.combining(c)).lower()


def pediu_troca(troca: bool, ordem: Optional[str]) -> bool:
    """Decisao 1 (27/11): so troca com a palavra "troca"/"nova" na ordem, ou com a marca explicita."""
    return bool(troca) or bool(ordem and _RE_TROCA.search(_sem_acento(ordem)))


def _da_org(col, org: int):
    return or_(col == org, col.is_(None)) if org == 1 else (col == org)


# ------------------------------------------------------------------ itens e chaves ------------------------------------
class Item:
    __slots__ = ("texto", "tipo", "chave", "situacao", "linha", "doc", "hora", "dono", "substituir", "doc_troca",
                 "reusar", "vencidas")

    def __init__(self, texto: str, tipo: str, chave: str):
        self.texto, self.tipo, self.chave = texto, tipo, chave
        self.situacao = "novo"
        self.linha: Optional[EmissorChave] = None
        self.doc: Optional[dict] = None
        self.hora = ""
        self.dono = None
        self.substituir: List[EmissorChave] = []
        self.doc_troca: Optional[dict] = None
        self.reusar: Optional[EmissorChave] = None
        self.vencidas: List[EmissorChave] = []

    def out(self) -> dict:
        o = {"item": self.texto, "tipo": self.tipo, "chave": self.chave, "situacao": self.situacao}
        lado = _lado_da_chave(self.tipo, self.chave)
        if lado in ("D", "E"):
            o["lado"] = lado
        if self.doc:
            o["doc"] = {"kind": self.doc["kind"], "id": self.doc["id"]}
        if self.hora:
            o["hora"] = self.hora
        if self.dono:
            o["dono"] = self.dono
        if self.situacao == "existe":
            o["aviso"] = (f"já existe {self.doc['kind'] if self.doc else 'documento'} "
                          f"{self.doc['id'] if self.doc else ''} ({' '.join(self.texto.split())[:70]})"
                          + (f", feito às {self.hora}" if self.hora else ""))
        elif self.situacao == "em_andamento":
            o["aviso"] = (f"em andamento ({self.dono or 'outro gerador'})"
                          + (f" desde {self.hora}" if self.hora else "") + f": {' '.join(self.texto.split())[:70]}")
        return o


def _itens_do_conteudo(tipo: str, conteudo: str) -> List[str]:
    c = conteudo or ""
    if tipo == "receita":
        return G.remedios_da_receita(c)
    if tipo in ("exame", "justificativa"):
        return G.itens_do_pedido(c)
    if tipo == "atestado":
        return ["atestado"]
    linhas = [l.strip() for l in c.splitlines() if l.strip()]
    if tipo == "fisio":
        return [" ".join(linhas)[:300] or "FISIOTERAPIA"]
    return linhas[:1]


def montar_itens(tipo: str, itens: Iterable[str], conteudo: Optional[str]) -> List[Item]:
    """Itens do pedido -> chaves (o servidor calcula). Sem itens, tira do conteudo (receita: os remedios)."""
    if tipo not in G.TIPOS_EMISSOR:
        raise HTTPException(422, f"Tipo inválido: use {', '.join(G.TIPOS_EMISSOR)}")
    brutos = [str(i).strip() for i in (itens or []) if str(i or "").strip()]
    if not brutos:
        brutos = _itens_do_conteudo(tipo, conteudo or "")
    out, vistas = [], set()
    if not brutos:
        if not (conteudo or "").strip():
            raise HTTPException(422, "Sem item e sem conteúdo para reservar")
        # documento sem item reconhecivel (ex.: receita so de orientacao): chave pelo texto inteiro, so casa igual
        k = f"{'rx' if tipo == 'receita' else tipo}|txt:{_hash(G.norm(conteudo))[:20]}"
        return [Item((conteudo or "").strip()[:300], tipo, k)]
    for b in brutos:
        for t, k in G.chaves_item(tipo, b):
            if (t, k) in vistas:
                continue
            vistas.add((t, k))
            out.append(Item(G.sem_qtd(b)[:300], t, k[:200]))
    return out


def _so_exato(chave: str) -> bool:
    return "|txt:" in chave or "|?" in chave


def _lado_da_chave(tipo: str, chave: Optional[str]) -> Optional[str]:
    """Lado gravado na chave do exame (D, E ou *); None se a chave nao tem lado (lab, fisio, remedio...)."""
    if tipo not in ("exame", "justificativa") or not chave or chave.startswith(("lab|", "just|lab|")):
        return None
    p = chave.split("|")
    return p[-1] if len(p) >= 4 and p[-1] in ("D", "E", "*") else None


def _casa(it_tipo: str, it_texto: str, it_chave: str, outro_texto: str, outro_chave: Optional[str]) -> bool:
    if outro_chave is not None and outro_chave == it_chave:
        return True
    if _so_exato(it_chave) or (outro_chave and _so_exato(outro_chave)):
        return False
    try:
        if not G.mesmo_item(it_tipo, it_texto, outro_texto or ""):
            return False
    except Exception:
        return False
    # bilateral vira uma chave por lado: "RNM JOELHOS" (chave D) nao e o mesmo que "RNM JOELHO ESQUERDO"
    la = _lado_da_chave(it_tipo, it_chave)
    if la in (None, "*"):
        return True
    lb = _lado_da_chave(it_tipo, outro_chave) if outro_chave else None
    if lb is not None:
        return lb == "*" or lb == la
    lados = G.lados(outro_texto or "")
    return not lados or la in lados


# ------------------------------------------------------------------ documentos ja gravados hoje (qualquer mao) --------
def _do_dia(doc_date, created_at, dia: date) -> bool:
    return doc_date == dia or _dia_br(created_at) == dia


def _docs_de_hoje(db: Session, org: int, pid: int, dia: date, tipo: str) -> List[dict]:
    """[{kind, id, criado, linhas}] dos documentos de HOJE do paciente, feitos por qualquer mao (tela, PC, Escriba)."""
    from models.documents import ExamRequest, MedicalReport, PhysioRequest
    from models.patient_documents import PatientDocument
    from models.patient_rx import PatientRx
    ontem = dia - timedelta(days=1)
    out: List[dict] = []
    if tipo == "receita":
        for r in db.query(PatientRx).filter(PatientRx.patient_id == pid, _da_org(PatientRx.organization_id, org),
                                            PatientRx.date >= ontem).all():
            if _do_dia(r.date, r.created_at, dia):
                out.append({"kind": "receita", "id": r.id, "criado": r.created_at,
                            "linhas": G.remedios_da_receita(r.instructions)})
        return out
    if tipo in ("exame", "fisio"):
        for e in db.query(ExamRequest).filter(ExamRequest.patient_id == pid, _da_org(ExamRequest.organization_id, org),
                                              ExamRequest.date >= ontem).all():
            if not _do_dia(e.date, e.created_at, dia):
                continue
            linhas = [l for l in G.itens_do_pedido(e.free_text) if G.eh_fisio(l) == (tipo == "fisio")]
            if not e.free_text and e.exams:
                linhas += [str(x.get("name") if isinstance(x, dict) else x) for x in e.exams]
            if linhas:
                out.append({"kind": "exame", "id": e.id, "criado": e.created_at, "linhas": linhas})
    if tipo == "fisio":
        for r in db.query(MedicalReport).filter(MedicalReport.patient_id == pid,
                                                _da_org(MedicalReport.organization_id, org),
                                                MedicalReport.report_type == "encaminhamento",
                                                MedicalReport.date >= ontem).all():
            primeira = next((l for l in (r.content or "").splitlines() if l.strip()), "")
            texto = f"{r.title or ''} {primeira}"
            if _do_dia(r.date, r.created_at, dia) and G.eh_fisio(texto):
                out.append({"kind": "encaminhamento", "id": r.id, "criado": r.created_at, "linhas": [texto]})
        for p in db.query(PhysioRequest).filter(PhysioRequest.patient_id == pid,
                                                _da_org(PhysioRequest.organization_id, org),
                                                PhysioRequest.date >= ontem).all():
            if _do_dia(p.date, p.created_at, dia):
                out.append({"kind": "fisio", "id": p.id, "criado": p.created_at,
                            "linhas": [f"FISIOTERAPIA {p.techniques or ''} {p.diagnosis or ''}"]})
        for d in db.query(PatientDocument).filter(PatientDocument.patient_id == pid,
                                                  _da_org(PatientDocument.organization_id, org),
                                                  PatientDocument.is_deleted == False,  # noqa: E712
                                                  PatientDocument.date >= ontem).all():
            t = G.norm(d.title)
            if _do_dia(d.date, d.created_at, dia) and "guia" in t and "fisio" in t:
                out.append({"kind": "guia", "id": d.id, "criado": d.created_at, "linhas": [d.title or "FISIOTERAPIA"]})
        return out
    if tipo == "exame":
        return out
    q = db.query(MedicalReport).filter(MedicalReport.patient_id == pid, _da_org(MedicalReport.organization_id, org),
                                       MedicalReport.date >= ontem)
    for r in q.all():
        if not _do_dia(r.date, r.created_at, dia):
            continue
        titulo = r.title or ""
        if tipo == "atestado" and r.report_type == "atestado":
            out.append({"kind": "atestado", "id": r.id, "criado": r.created_at, "linhas": ["atestado"]})
        elif tipo == "encaminhamento" and r.report_type == "encaminhamento":
            primeira = next((l for l in (r.content or "").splitlines() if l.strip()), "")
            if not G.eh_fisio(f"{titulo} {primeira}"):
                out.append({"kind": "encaminhamento", "id": r.id, "criado": r.created_at,
                            "linhas": [titulo or primeira]})
        elif tipo == "justificativa" and re.match(r"\s*justificativa", titulo, re.I):
            partes = [p.strip() for p in re.split(r"[—–,]| - ", titulo)[1:] if p.strip()]
            out.append({"kind": "laudo", "id": r.id, "criado": r.created_at, "linhas": partes})
    return out


# ------------------------------------------------------------------ avaliar (sem gravar) ------------------------------
def _linhas_do_dia(db: Session, org: int, pid: int, dia: date) -> List[EmissorChave]:
    return (db.query(EmissorChave).filter(EmissorChave.organization_id == org, EmissorChave.patient_id == pid,
                                          EmissorChave.dia == dia).order_by(EmissorChave.id).all())


def _vencida(r: EmissorChave, agora: datetime) -> bool:
    v = _utc(r.vence_em)
    return r.estado == "reservado" and v is not None and v <= agora


def _avaliar(db: Session, org: int, pid: int, dia: date, itens: List[Item], troca: bool, agora: datetime) -> None:
    linhas = _linhas_do_dia(db, org, pid, dia)
    substituidas = [r for r in linhas if r.estado == "substituido"]
    docs_cache: dict = {}
    for it in itens:
        cand = [r for r in linhas if r.tipo == it.tipo and r.estado in ESTADOS_ATIVOS
                and _casa(it.tipo, it.texto, it.chave, r.texto, r.chave)]
        andando = [r for r in cand if r.estado == "reservado" and not _vencida(r, agora)]
        prontas = [r for r in cand if r.estado == "pronto"]
        it.vencidas = [r for r in cand if _vencida(r, agora)]
        if andando:
            r = andando[0]
            it.situacao, it.linha, it.dono, it.hora = "em_andamento", r, r.dono, hora_br(r.atualizado_em or r.criado_em)
            continue
        if prontas and not troca:
            r = prontas[0]
            it.situacao, it.linha = "existe", r
            it.doc = {"kind": r.doc_kind, "id": r.doc_id} if r.doc_id else None
            it.hora = hora_br(r.feito_em or r.atualizado_em)
            continue
        if prontas and troca:
            it.substituir = prontas
        else:
            # o que foi gravado hoje SEM reserva (a tela, ou antes do emissor existir)
            if it.tipo not in docs_cache:
                docs_cache[it.tipo] = _docs_de_hoje(db, org, pid, dia, it.tipo)
            achado = None
            for d in docs_cache[it.tipo]:
                for l in d["linhas"]:
                    if not _casa(it.tipo, it.texto, it.chave, l, None):
                        continue
                    if any(s.doc_kind == d["kind"] and s.doc_id == d["id"] and _casa(it.tipo, l, it.chave, s.texto, None)
                           for s in substituidas):
                        continue   # este item deste documento ja foi trocado por ordem do medico
                    achado = d
                    break
                if achado:
                    break
            if achado and not troca:
                it.situacao, it.doc, it.hora = "existe", {"kind": achado["kind"], "id": achado["id"]}, hora_br(achado["criado"])
                continue
            if achado and troca:
                it.doc_troca = achado
        reusar = [r for r in it.vencidas if r.chave == it.chave]
        it.reusar = reusar[0] if reusar else None
        it.situacao = "novo"


def situacao(db: Session, org: int, pid: int, tipo: str, itens: Iterable[str] = (), conteudo: Optional[str] = None,
             dia: Optional[date] = None) -> List[dict]:
    """So le (sem fila, sem gravar): a situacao de cada item hoje. Usado pelo "Tudo de hoje" e pelo botao da guia."""
    its = montar_itens(tipo, itens, conteudo)
    _avaliar(db, org, pid, dia or today_br(), its, False, _agora())
    return [i.out() for i in its]


# ------------------------------------------------------------------ reservar ------------------------------------------
def reservar(db: Session, org: int, pid: int, tipo: str, itens: Iterable[str] = (), conteudo: Optional[str] = None,
             origem: Optional[str] = None, dono: Optional[str] = None, troca: bool = False, parcial: bool = False,
             guia: bool = False, dia: Optional[date] = None) -> dict:
    """Confere e reserva NUMA operacao so (dentro da fila do paciente). Padrao "tudo ou nada": se algum item ja
    existe ou esta em andamento, nao reserva nada e diz quais sao novos. parcial=True reserva so os novos."""
    its = montar_itens(tipo, itens, conteudo)
    tipos = {i.tipo for i in its}
    if len(tipos) > 1:
        raise HTTPException(422, "Um lote = um documento: não misture " + " e ".join(sorted(tipos)) + " no mesmo pedido")
    if tipos <= {"exame", "justificativa"} and len({G.classe(i.texto) for i in its}) > 1:
        raise HTTPException(422, "Um lote = um documento: separe os exames por classe (uma reserva por classe)")
    if guia and len({i.texto for i in its}) > MAX_ITENS_GUIA:
        raise HTTPException(422, f"A guia tem {MAX_ITENS_GUIA} linhas: reserve de {MAX_ITENS_GUIA} em {MAX_ITENS_GUIA}")
    dono = dono if dono in DONOS else "sessao"
    dia = dia or today_br()
    prazo = PRAZO_GUIA_S if guia else PRAZO_DOC_S
    h = _hash(conteudo or "\n".join(i.texto for i in its))
    for tentativa in (1, 2):
        with fila_do_paciente(db, org, pid):
            agora = _agora()
            _avaliar(db, org, pid, dia, its, troca, agora)
            novos = [i for i in its if i.situacao == "novo"]
            barram = [i for i in its if i.situacao != "novo"]
            reservar_agora = bool(novos) and (parcial or not barram)
            lote = token = None
            vence = agora + timedelta(seconds=prazo)
            # o que achamos gravado hoje sem chave ganha a chave "pronto" (a proxima conferencia ja ve aqui)
            for i in its:
                if i.situacao == "existe" and i.linha is None and i.doc:
                    db.add(EmissorChave(organization_id=org, patient_id=pid, dia=dia, tipo=i.tipo, chave=i.chave,
                                        texto=i.texto, lote=uuid.uuid4().hex, token="-", estado="pronto", dono="tela",
                                        origem="documento de hoje", doc_kind=i.doc["kind"], doc_id=i.doc["id"],
                                        feito_em=agora))
            if reservar_agora:
                lote, token = uuid.uuid4().hex, secrets.token_hex(16)
                for i in novos:
                    for r in i.substituir:
                        r.estado, r.substituido_por = "substituido", lote
                    if i.doc_troca:   # documento feito sem chave e trocado agora: guarda o historico da troca
                        db.add(EmissorChave(organization_id=org, patient_id=pid, dia=dia, tipo=i.tipo, chave=i.chave,
                                            texto=i.texto, lote=uuid.uuid4().hex, token="-", estado="substituido",
                                            dono="tela", origem="documento de hoje", doc_kind=i.doc_troca["kind"],
                                            doc_id=i.doc_troca["id"], substituido_por=lote, feito_em=agora))
                    for r in i.vencidas:
                        if r is not i.reusar and r.estado == "reservado":
                            r.estado = "falhou"   # reserva vencida de outra chave: liberada (o dono leva 409 ao gravar)
                    db.flush()
                    campos = dict(lote=lote, token=token, estado="reservado", dono=dono, origem=(origem or "")[:120],
                                  formato="guia" if guia else "documento", vence_em=vence, texto=i.texto,
                                  conteudo_hash=h, doc_kind=None, doc_id=None, feito_em=None)
                    if i.reusar is not None:   # reserva vencida da MESMA chave: assume a mesma linha com token novo
                        for k, v in campos.items():
                            setattr(i.reusar, k, v)
                        i.reusar.tentativas = (i.reusar.tentativas or 1) + 1
                        i.linha = i.reusar
                    else:
                        i.linha = EmissorChave(organization_id=org, patient_id=pid, dia=dia, tipo=i.tipo, chave=i.chave,
                                               **campos)
                        db.add(i.linha)
                    i.hora = hora_br(agora)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                if tentativa == 2:
                    raise HTTPException(409, "Outro gerador reservou este documento agora. Confira de novo.")
                for i in its:
                    i.__init__(i.texto, i.tipo, i.chave)
                continue
            saida = [i.out() for i in its]
            break
    novos_txt = [i.texto for i in its if i.situacao == "novo"]
    return {
        "reservado": bool(lote), "lote": lote, "token": token, "cabecalho": f"{lote}:{token}" if lote else None,
        "vence_em": vence.isoformat() if lote else None, "prazo_s": prazo, "itens": saida,
        "novos": novos_txt if (lote or not parcial) else [],
        "mensagem": _mensagem(its, bool(lote)),
    }


def _mensagem(its: List[Item], reservado: bool) -> str:
    ja = [i.out()["aviso"] for i in its if i.situacao in ("existe", "em_andamento")]
    novos = [i.texto for i in its if i.situacao == "novo"]
    if not ja:
        return "reservado" if reservado else "nada a reservar"
    m = "Já existe hoje -> não reservei: " + "; ".join(dict.fromkeys(ja)) + "."
    if reservado:
        return "Reservei só os novos (" + "; ".join(novos) + "). " + m
    if novos:
        m += " NOVOS (refaça só com estes): " + "; ".join(dict.fromkeys(novos)) + "."
    return m


# ------------------------------------------------------------------ gravar com o lote ---------------------------------
def ler_cabecalho(valor: Optional[str]):
    """'lote:token' -> (lote, token). Ausente -> None (a rota fica como sempre). Malformado -> 422."""
    if not isinstance(valor, str) or not valor.strip():   # ausente (ou rota chamada direto, sem o FastAPI)
        return None
    lote, sep, token = str(valor).strip().partition(":")
    if not sep or not re.fullmatch(r"[0-9a-f]{32}", lote) or not re.fullmatch(r"[0-9a-f]{32}", token):
        raise HTTPException(422, "Cabeçalho X-Emissor-Lote inválido (use lote:token da reserva)")
    return lote, token


class Lote:
    def __init__(self, linhas: List[EmissorChave]):
        self.linhas = linhas
        self.feito = all(r.estado == "pronto" for r in linhas)
        self.doc_kind = linhas[0].doc_kind if self.feito else None
        self.doc_id = linhas[0].doc_id if self.feito else None
        self.tipo = linhas[0].tipo

    def itens(self) -> List[str]:
        return list(dict.fromkeys(r.texto for r in self.linhas if r.texto))


def abrir_lote(db: Session, org: int, pid: int, cab, tipos: Iterable[str]) -> Lote:
    """Chamar DENTRO da fila do paciente. Lote de outro, tomado, falhado ou de outro paciente: 409.
    Ja gravado (mesmo lote duas vezes): devolve feito=True com o documento, e a rota devolve o MESMO documento."""
    lote, token = cab
    linhas = db.query(EmissorChave).filter(EmissorChave.lote == lote).all()
    if not linhas or any(r.token != token for r in linhas):
        raise HTTPException(409, "Reserva não é mais sua (tomada por outro gerador ou inexistente). Nada foi gravado.")
    if any(r.organization_id != org or r.patient_id != pid for r in linhas):
        raise HTTPException(409, "Reserva de outro paciente. Nada foi gravado.")
    if any(r.estado not in ESTADOS_ATIVOS for r in linhas):
        raise HTTPException(409, "Reserva já liberada (falhou ou foi substituída). Reserve de novo. Nada foi gravado.")
    if len({r.estado for r in linhas}) > 1:
        raise HTTPException(409, "Reserva pela metade. Reserve de novo. Nada foi gravado.")
    tipos = set(tipos)
    if any(r.tipo not in tipos for r in linhas):
        raise HTTPException(409, f"Reserva de {linhas[0].tipo} não serve para este documento. Nada foi gravado.")
    return Lote(linhas)


def conferir_conteudo(lote: Lote, linhas_doc: List[str]) -> None:
    """Cada item reservado tem de estar no que vai ser gravado (receita/pedido). Senao 422, nada gravado."""
    faltam = []
    for r in lote.linhas:
        if r.chave and "|txt:" in r.chave:
            continue
        if not any(_casa(r.tipo, r.texto or "", r.chave, l, None) or r.chave in [k for _, k in G.chaves_item(r.tipo, l)]
                   for l in linhas_doc):
            faltam.append(r.texto or r.chave)
    if faltam:
        raise HTTPException(422, "O documento não traz o que foi reservado (" + "; ".join(dict.fromkeys(faltam))[:200]
                            + "). Nada foi gravado.")


def marcar_pronto(lote: Lote, kind: str, doc_id: int) -> None:
    agora = _agora()
    for r in lote.linhas:
        r.estado, r.doc_kind, r.doc_id, r.feito_em = "pronto", kind, doc_id, agora


# ------------------------------------------------------------------ conferencia do PDF da guia -------------------------
def texto_do_pdf(conteudo: bytes) -> str:
    import fitz
    with fitz.open(stream=conteudo, filetype="pdf") as pdf:
        return "\n".join(p.get_text() for p in pdf)


_PALAVRAS_FISIO = {"motora": r"fisioterap", "rpg": r"\brpg\b|reeducacao postural", "hidro": r"hidroterap",
                   "acupuntura": r"acupunt"}


def conferir_pdf(texto_pdf: str, nome_paciente: str, lote: Lote) -> None:
    """A guia enviada tem o NOME do paciente e CADA item reservado (caso de 27/11: a guia da fisio subiu com o
    conteudo da USG). Descricao cortada pela guia: basta o comeco (20 letras) ou as 3 primeiras palavras longas."""
    t = G.norm(texto_pdf)
    if not t:
        raise HTTPException(422, "Não consegui ler o texto da guia (PDF sem texto). Nada foi gravado; faça pela aba.")
    pal = set(t.split())
    nome = G.norm(nome_paciente)
    partes = [w for w in nome.split() if len(w) >= 3]
    if not nome or not (nome in t or (partes and partes[0] in pal and partes[-1] in pal)):
        raise HTTPException(422, "A guia enviada não é deste paciente (o nome não confere). Nada foi gravado.")
    faltam = []
    for item in lote.itens():
        n = G.norm(item)
        if lote.tipo == "fisio":
            ok = bool(re.search(_PALAVRAS_FISIO.get(G.tipo_fisio(item), r"fisioterap"), t))
        else:
            longas = [w for w in n.split() if len(w) >= 4][:3]
            ok = n[:20] in t or (bool(longas) and all(w in pal for w in longas))
        if not ok:
            faltam.append(item)
    if faltam:
        raise HTTPException(422, "A guia enviada não traz o que foi reservado (" + "; ".join(faltam)[:200]
                            + "). Nada foi gravado.")


def texto_historico_guia(itens: List[str], hd: str) -> str:
    """O mesmo texto do _historico_exames do PC (28/10): o marcador faz o 'Tudo de hoje' nao imprimir de novo."""
    return ("SOLICITO: \n\n\n" + "\n".join(itens) + "\n\nHD: " + (hd or "").upper()
            + "\n\n(Solicitado em guia SP/SADT — ver aba Documentos)")


# ------------------------------------------------------------------ falhou / renovar / hoje -----------------------------
def _linhas_do_token(db: Session, org: int, lote: str, token: str) -> List[EmissorChave]:
    linhas = db.query(EmissorChave).filter(EmissorChave.lote == lote, EmissorChave.organization_id == org).all()
    if not linhas or any(r.token != token for r in linhas):
        raise HTTPException(409, "Reserva não é mais sua (tomada por outro gerador ou inexistente)")
    return linhas


def falhou(db: Session, org: int, lote: str, token: str, motivo: str = "") -> dict:
    """Libera a chave. A troca que este lote pedia volta atras (o documento antigo volta a valer)."""
    pre = db.query(EmissorChave).filter(EmissorChave.lote == lote, EmissorChave.organization_id == org).first()
    if not pre:
        raise HTTPException(409, "Reserva inexistente")
    with fila_do_paciente(db, org, pre.patient_id):
        linhas = _linhas_do_token(db, org, lote, token)
        if any(r.estado == "pronto" for r in linhas):
            raise HTTPException(409, "O documento deste lote já foi gravado; não dá para marcar falha")
        n = 0
        for r in linhas:
            if r.estado == "reservado":
                r.estado = "falhou"
                r.origem = ((r.origem or "") + f" | falhou: {motivo}")[:120] if motivo else r.origem
                n += 1
        for r in db.query(EmissorChave).filter(EmissorChave.substituido_por == lote,
                                               EmissorChave.estado == "substituido").all():
            if r.doc_id:   # o documento antigo continua gravado: volta a valer
                r.estado, r.substituido_por = "pronto", None
        db.flush()
        try:
            db.commit()
        except IntegrityError:   # outra chave igual ja ativa: deixa a antiga como substituida
            db.rollback()
            raise HTTPException(409, "Não consegui desfazer a troca (já há outro documento ativo)")
    return {"ok": True, "liberadas": n}


def renovar(db: Session, org: int, lote: str, token: str) -> dict:
    pre = db.query(EmissorChave).filter(EmissorChave.lote == lote, EmissorChave.organization_id == org).first()
    if not pre:
        raise HTTPException(409, "Reserva inexistente")
    with fila_do_paciente(db, org, pre.patient_id):
        linhas = _linhas_do_token(db, org, lote, token)
        if any(r.estado != "reservado" for r in linhas):
            raise HTTPException(409, "Reserva já terminada (gravada, falhou ou substituída)")
        prazo = PRAZO_GUIA_S if linhas[0].formato == "guia" else PRAZO_DOC_S
        vence = _agora() + timedelta(seconds=prazo)
        for r in linhas:
            r.vence_em = vence
        db.commit()
    return {"ok": True, "vence_em": vence.isoformat()}


def hoje(db: Session, org: int, pid: int, dia: Optional[date] = None) -> List[dict]:
    return [{"id": r.id, "tipo": r.tipo, "chave": r.chave, "item": r.texto, "estado": r.estado, "dono": r.dono,
             "origem": r.origem, "doc": {"kind": r.doc_kind, "id": r.doc_id} if r.doc_id else None,
             "hora": hora_br(r.feito_em or r.atualizado_em or r.criado_em), "lote": r.lote,
             "substituido_por": r.substituido_por}
            for r in _linhas_do_dia(db, org, pid, dia or today_br())]
