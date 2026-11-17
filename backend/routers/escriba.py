"""Escriba integrado: gravar a consulta pela tela do OrthoMedic (fatia 1, 17/11/2026).

Duas portas:
1. Aparelho do medico (PC, celular, iPad): rotas com login de medico (require_doctor).
   Secretaria recebe 403. Tudo e idempotente: repetir o envio nao duplica.
2. Ponte do PC do Escriba (escriba-clinica/ao_vivo/ponte_site.py): rotas /escriba/ponte/*
   com a chave ESCRIBA_PONTE_TOKEN (variavel de ambiente). Sem a variavel, a ponte fica desligada.

Regras:
- Uma sessao por atendimento (entrada da sala de espera).
- So um aparelho grava por vez: quem aperta Gravar por ultimo assume; o outro para.
- O aviso CFM e registrado uma vez por paciente, e sem ele nao se grava.
- O audio fica aqui so ate o PC confirmar; a confirmacao apaga o audio.
"""
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor
from models.escriba import EscribaConsentimento, EscribaPedaco, EscribaSessao
from models.organization import User
from models.patient import Patient
from models.queue import WaitingRoomEntry
from tzutil import today_br

router = APIRouter(prefix="/escriba", tags=["escriba"])

TAMANHO_MAX = 8 * 1024 * 1024        # pedaco de 10 s tem ~30 KB; 8 MB e folga para reenvio grande
SINAL_VIVO_S = 40                    # aparelho sem sinal ha mais que isso nao conta como "gravando"
EXTENSOES = {"webm", "m4a", "mp4", "ogg", "wav"}
TIPOS = {"pc", "celular", "ipad"}
TEXTO_VERSAO = "v1-2026-11-17"


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(d: Optional[datetime]) -> Optional[datetime]:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _iso(d: Optional[datetime]) -> Optional[str]:
    d = _utc(d)
    return d.isoformat() if d else None


def _org(u: User) -> Optional[int]:
    return getattr(u, "organization_id", None) or 1


def _mesma_org(u: User, org_id) -> bool:
    return u.role == "superadmin" or (org_id or 1) == _org(u)


def _entrada_da_org(db: Session, entry_id: int, u: User):
    e = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, "Atendimento não encontrado")
    p = db.query(Patient).filter(Patient.id == e.patient_id).first()
    if not p or not _mesma_org(u, p.organization_id):
        raise HTTPException(404, "Atendimento não encontrado")
    return e, p


def _sessao_da_org(db: Session, sid: int, u: User) -> EscribaSessao:
    s = db.query(EscribaSessao).filter(EscribaSessao.id == sid).first()
    if not s or not _mesma_org(u, s.organization_id):
        raise HTTPException(404, "Sessão não encontrada")
    return s


def _max_seq(db: Session, sid: int, aparelho: Optional[str]) -> int:
    if not aparelho:
        return -1
    r = (db.query(EscribaPedaco.seq).filter(EscribaPedaco.sessao_id == sid, EscribaPedaco.aparelho == aparelho)
         .order_by(EscribaPedaco.seq.desc()).first())
    return r[0] if r else -1


def _sessao_out(db: Session, s: EscribaSessao, aparelho: Optional[str] = None, entry_status: Optional[str] = None) -> dict:
    sinal = _utc(s.ultimo_sinal)
    vivo = bool(sinal and (_agora() - sinal).total_seconds() < SINAL_VIVO_S)
    return {
        "id": s.id, "entry_id": s.entry_id, "patient_id": s.patient_id, "estado": s.estado,
        "aparelho_ativo": s.aparelho_ativo, "aparelho_tipo": s.aparelho_tipo,
        "ultimo_sinal": _iso(s.ultimo_sinal), "sinal_vivo": vivo,
        "ativo": bool(aparelho and aparelho == s.aparelho_ativo),
        "max_seq": _max_seq(db, s.id, aparelho),
        "entry_status": entry_status,
    }


def _status_da_entrada(db: Session, entry_id: int) -> Optional[str]:
    e = db.query(WaitingRoomEntry.status).filter(WaitingRoomEntry.id == entry_id).first()
    return e[0] if e else None


def _seguir_status(s: EscribaSessao, status: Optional[str]) -> bool:
    """A consulta mudou de status por fora: so pode PAUSAR ou PARAR, nunca ligar."""
    if s.estado == "gravando" and status == "suspended":
        s.estado = "pausada"
        return True
    if s.estado in ("gravando", "pausada") and status in ("attended", "waiting", "absent", None):
        s.estado = "parada"
        s.finalizada_em = _agora()
        return True
    return False


def seguir_status_da_entrada(db: Session, entry_id: int, status: str) -> None:
    """Chamado pela sala de espera (Suspender / Finalizar). Nunca liga a gravacao."""
    s = db.query(EscribaSessao).filter(EscribaSessao.entry_id == entry_id).first()
    if s:
        _seguir_status(s, status)


# ─────────────────────────── aparelho do medico ───────────────────────────

@router.get("/atendimento-atual")
def atendimento_atual(db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """O atendimento EM CURSO (status attending, hoje) da conta do medico. Usado pela tela /escriba-gravar."""
    q = (db.query(WaitingRoomEntry, Patient).join(Patient, Patient.id == WaitingRoomEntry.patient_id)
         .filter(WaitingRoomEntry.status == "attending", WaitingRoomEntry.entry_date == today_br()))
    if u.role != "superadmin":
        q = q.filter(Patient.organization_id == _org(u))
    linhas = q.all()
    if not linhas:
        return {"entry": None, "sessao": None, "consentimento": False}
    e, p = max(linhas, key=lambda x: (_iso(x[0].called_at) or "", x[0].id))
    s = db.query(EscribaSessao).filter(EscribaSessao.entry_id == e.id).first()
    c = db.query(EscribaConsentimento).filter(EscribaConsentimento.patient_id == p.id,
                                              EscribaConsentimento.organization_id == (p.organization_id or 1)).first()
    return {"entry": {"id": e.id, "patient_id": p.id, "patient_name": p.name, "status": e.status, "clinic_id": e.clinic_id},
            "sessao": _sessao_out(db, s, None, e.status) if s else None, "consentimento": bool(c)}


@router.get("/consentimento/{patient_id}")
def ler_consentimento(patient_id: int, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p or not _mesma_org(u, p.organization_id):
        raise HTTPException(404, "Paciente não encontrado")
    c = db.query(EscribaConsentimento).filter(EscribaConsentimento.patient_id == p.id,
                                              EscribaConsentimento.organization_id == (p.organization_id or 1)).first()
    return {"tem": bool(c), "criado_em": _iso(c.criado_em) if c else None}


class ConsentimentoIn(BaseModel):
    patient_id: int
    entry_id: Optional[int] = None


@router.post("/consentimento")
def registrar_consentimento(body: ConsentimentoIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """O clique "Avisei — gravar". Uma vez por paciente; repetir nao duplica."""
    p = db.query(Patient).filter(Patient.id == body.patient_id).first()
    if not p or not _mesma_org(u, p.organization_id):
        raise HTTPException(404, "Paciente não encontrado")
    org = p.organization_id or 1
    c = db.query(EscribaConsentimento).filter(EscribaConsentimento.patient_id == p.id,
                                              EscribaConsentimento.organization_id == org).first()
    if not c:
        c = EscribaConsentimento(organization_id=org, patient_id=p.id, entry_id=body.entry_id,
                                 doctor_user_id=u.id, texto_versao=TEXTO_VERSAO)
        db.add(c)
        try:
            db.commit()
        except Exception:  # dois aparelhos ao mesmo tempo: a trava unica segura, vale o primeiro
            db.rollback()
            c = db.query(EscribaConsentimento).filter(EscribaConsentimento.patient_id == p.id,
                                                      EscribaConsentimento.organization_id == org).first()
    return {"tem": True, "criado_em": _iso(c.criado_em) if c else None}


class SessaoIn(BaseModel):
    entry_id: int
    aparelho: str
    tipo: str = "pc"


@router.post("/sessoes")
def ligar_sessao(body: SessaoIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """Liga (ou religa) a gravacao NESTE aparelho. So o clique do aparelho chama esta rota.
    Cria a sessao do atendimento na primeira vez; depois devolve a mesma (idempotente)."""
    aparelho = (body.aparelho or "").strip()[:64]
    if not aparelho:
        raise HTTPException(422, "Aparelho não informado")
    e, p = _entrada_da_org(db, body.entry_id, u)
    if e.status != "attending":
        raise HTTPException(409, "A consulta não está em andamento. Inicie ou continue a consulta antes de gravar.")
    org = p.organization_id or 1
    if not db.query(EscribaConsentimento).filter(EscribaConsentimento.patient_id == p.id,
                                                 EscribaConsentimento.organization_id == org).first():
        raise HTTPException(409, "Falta o aviso de gravação deste paciente.")
    s = db.query(EscribaSessao).filter(EscribaSessao.entry_id == e.id).first()
    if not s:
        s = EscribaSessao(organization_id=org, entry_id=e.id, patient_id=p.id, doctor_user_id=u.id)
        db.add(s)
        try:
            db.flush()
        except Exception:
            db.rollback()
            s = db.query(EscribaSessao).filter(EscribaSessao.entry_id == e.id).first()
    s.estado = "gravando"
    s.finalizada_em = None
    s.aparelho_ativo = aparelho
    s.aparelho_tipo = body.tipo if body.tipo in TIPOS else "pc"
    s.ultimo_sinal = _agora()
    db.commit()
    db.refresh(s)
    return _sessao_out(db, s, aparelho, e.status)


@router.get("/sessoes/entrada/{entry_id}")
def sessao_da_entrada(entry_id: int, aparelho: Optional[str] = None, db: Session = Depends(get_db),
                      u: User = Depends(require_doctor)):
    """Para a coluna lilas no PC: mostra se outro aparelho esta gravando (ex.: "gravando no celular")."""
    e, _p = _entrada_da_org(db, entry_id, u)
    s = db.query(EscribaSessao).filter(EscribaSessao.entry_id == e.id).first()
    return _sessao_out(db, s, aparelho, e.status) if s else None


class SinalIn(BaseModel):
    aparelho: str
    gravando: bool = True


@router.post("/sessoes/{sid}/sinal")
def sinal(sid: int, body: SinalIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """O aparelho avisa que segue gravando e fica sabendo do que mudou por fora.
    A resposta so pode mandar PAUSAR ou PARAR; nunca manda ligar."""
    s = _sessao_da_org(db, sid, u)
    status = _status_da_entrada(db, s.entry_id)
    mudou = _seguir_status(s, status)
    if body.aparelho == s.aparelho_ativo and body.gravando and s.estado == "gravando":
        s.ultimo_sinal = _agora()
        mudou = True
    if mudou:
        db.commit()
        db.refresh(s)
    return _sessao_out(db, s, body.aparelho, status)


class EstadoIn(BaseModel):
    estado: str           # pausada | parada
    aparelho: str


@router.post("/sessoes/{sid}/estado")
def mudar_estado(sid: int, body: EstadoIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """Pausar ou parar. Para ligar de novo, o aparelho chama POST /escriba/sessoes (clique)."""
    if body.estado not in ("pausada", "parada"):
        raise HTTPException(422, "Use pausada ou parada")
    s = _sessao_da_org(db, sid, u)
    # So o aparelho que grava pode pausar a sessao; parar vale de qualquer aparelho do medico.
    if body.estado == "pausada" and s.aparelho_ativo and body.aparelho != s.aparelho_ativo:
        return _sessao_out(db, s, body.aparelho, _status_da_entrada(db, s.entry_id))
    if s.estado != "parada":
        s.estado = body.estado
        if body.estado == "parada":
            s.finalizada_em = _agora()
        db.commit()
        db.refresh(s)
    return _sessao_out(db, s, body.aparelho, _status_da_entrada(db, s.entry_id))


@router.post("/sessoes/{sid}/pedacos")
async def receber_pedaco(sid: int, request: Request, aparelho: str = Query(...), seq: int = Query(..., ge=0),
                         ext: str = Query("webm"), t_ms: Optional[int] = Query(None),
                         db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """Um pedaco de audio. Mandar o mesmo (sessao, aparelho, seq) de novo devolve o mesmo id, sem duplicar.
    Aceita pedaco atrasado (gravado offline) mesmo com a sessao parada."""
    s = _sessao_da_org(db, sid, u)
    ext = ext.lower().strip(".")
    if ext not in EXTENSOES:
        raise HTTPException(422, "Formato de áudio não aceito")
    aparelho = aparelho.strip()[:64]
    ja = db.query(EscribaPedaco).filter(EscribaPedaco.sessao_id == s.id, EscribaPedaco.aparelho == aparelho,
                                        EscribaPedaco.seq == seq).first()
    if ja:
        return {"id": ja.id, "novo": False}
    corpo = await request.body()
    if not corpo:
        raise HTTPException(422, "Pedaço vazio")
    if len(corpo) > TAMANHO_MAX:
        raise HTTPException(413, "Pedaço grande demais")
    p = EscribaPedaco(sessao_id=s.id, aparelho=aparelho, seq=seq, ext=ext, tamanho=len(corpo), t_ms=t_ms, audio=corpo)
    db.add(p)
    try:
        db.commit()
    except Exception:  # corrida de dois envios iguais: a trava unica segura
        db.rollback()
        ja = db.query(EscribaPedaco).filter(EscribaPedaco.sessao_id == s.id, EscribaPedaco.aparelho == aparelho,
                                            EscribaPedaco.seq == seq).first()
        if ja:
            return {"id": ja.id, "novo": False}
        raise
    return {"id": p.id, "novo": True}


# ─────────────────────────── ponte do PC do Escriba ───────────────────────────

def exigir_ponte(x_escriba_ponte: Optional[str] = Header(None)) -> int:
    """Chave da ponte (variavel ESCRIBA_PONTE_TOKEN). Devolve a conta que a ponte enxerga."""
    chave = os.getenv("ESCRIBA_PONTE_TOKEN", "")
    if len(chave) < 24:
        raise HTTPException(503, "Ponte do Escriba desligada")
    if not x_escriba_ponte or not hmac.compare_digest(x_escriba_ponte.encode(), chave.encode()):
        raise HTTPException(401, "Chave da ponte inválida")
    try:
        return int(os.getenv("ESCRIBA_PONTE_ORG_ID", "1"))
    except ValueError:
        return 1


@router.get("/ponte/pendentes")
def ponte_pendentes(apos: int = 0, horas: int = 14, limite: int = 100, db: Session = Depends(get_db),
                    org: int = Depends(exigir_ponte)):
    """Pedacos com audio ainda nao confirmado (id > apos) e o estado das sessoes recentes."""
    limite = max(1, min(limite, 200))
    desde = _agora() - timedelta(hours=max(1, min(horas, 72)))
    ss = (db.query(EscribaSessao, Patient).join(Patient, Patient.id == EscribaSessao.patient_id)
          .filter(EscribaSessao.organization_id == org, EscribaSessao.atualizada_em >= desde)
          .order_by(EscribaSessao.id).all())
    sessoes = []
    for s, p in ss:
        e = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.id == s.entry_id).first()
        nasc = p.birthdate.strftime("%d/%m/%Y") if getattr(p, "birthdate", None) else None
        conv = " ".join(x for x in (p.insurance, p.insurance_plan) if x) or None
        sessoes.append({"id": s.id, "entry_id": s.entry_id, "patient_id": p.id, "nome": p.name, "nascimento": nasc,
                        "convenio": conv, "clinic_id": e.clinic_id if e else None, "estado": s.estado,
                        "criada_em": _iso(s.criada_em), "finalizada_em": _iso(s.finalizada_em)})
    ped = (db.query(EscribaPedaco.id, EscribaPedaco.sessao_id, EscribaPedaco.aparelho, EscribaPedaco.seq,
                    EscribaPedaco.ext, EscribaPedaco.t_ms, EscribaPedaco.criado_em)
           .join(EscribaSessao, EscribaSessao.id == EscribaPedaco.sessao_id)
           .filter(EscribaSessao.organization_id == org, EscribaPedaco.id > apos,
                   EscribaPedaco.audio.isnot(None), EscribaPedaco.confirmado_em.is_(None))
           .order_by(EscribaPedaco.id).limit(limite).all())
    pedacos = [{"id": r.id, "sessao_id": r.sessao_id, "aparelho": r.aparelho, "seq": r.seq, "ext": r.ext,
                "t_ms": r.t_ms, "criado_em": _iso(r.criado_em)} for r in ped]
    return {"sessoes": sessoes, "pedacos": pedacos, "agora": _iso(_agora())}


def _pedaco_da_ponte(db: Session, pid: int, org: int) -> EscribaPedaco:
    p = (db.query(EscribaPedaco).join(EscribaSessao, EscribaSessao.id == EscribaPedaco.sessao_id)
         .filter(EscribaPedaco.id == pid, EscribaSessao.organization_id == org).first())
    if not p:
        raise HTTPException(404, "Pedaço não encontrado")
    return p


@router.get("/ponte/pedacos/{pid}/audio")
def ponte_audio(pid: int, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    p = _pedaco_da_ponte(db, pid, org)
    if p.audio is None:
        raise HTTPException(410, "Áudio já apagado")
    tipo = {"m4a": "audio/mp4", "mp4": "audio/mp4", "ogg": "audio/ogg", "wav": "audio/wav"}.get(p.ext, "audio/webm")
    return Response(content=bytes(p.audio), media_type=tipo)


@router.post("/ponte/pedacos/{pid}/recebido")
def ponte_recebido(pid: int, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """O PC confirma: o audio deste pedaco e apagado daqui. Repetir nao faz mal."""
    p = _pedaco_da_ponte(db, pid, org)
    if p.audio is not None or p.confirmado_em is None:
        p.audio = None
        p.confirmado_em = p.confirmado_em or _agora()
        db.commit()
    return {"ok": True, "id": p.id}
