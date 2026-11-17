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
import json
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor
from models.escriba import EscribaConsentimento, EscribaPedaco, EscribaPedido, EscribaSessao, EscribaSugestao
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


# ─────────── fatia 3 (17/11/2026): botoes "Voce disse que vai fazer" ───────────
# A ponte do PC grava as sugestoes (chave estavel: repetir a frase nao duplica).
# O medico ve os botoes na coluna, abre a aba ja preenchida, salva (feita) ou descarta.
# Exame ou fisio de convenio ganha "Gerar guia oficial (PC)": vira um pedido que o PC executa.

TIPOS_SUG = {"exame", "fisio", "receita", "encaminhamento", "atestado", "procedimento"}
ESTADOS_MEDICO = {"aberta", "feita", "descartada", "nova"}
# mesma regra do consulta.py (28/10): sem convenio, cortesia ou desconto = particular (nunca guia SADT)
_MARCAS_PARTICULAR = ("PARTICULAR", "CORTESIA", "ADEILDO", "DESCONTO", "GABRIEL")


def eh_particular(convenio: Optional[str]) -> bool:
    c = (convenio or "").strip().upper()
    return not c or any(k in c for k in _MARCAS_PARTICULAR)


def _json(txt: Optional[str]):
    if not txt:
        return {}
    try:
        return json.loads(txt)
    except ValueError:
        return {}


def _pedido_out(p: Optional[EscribaPedido]) -> Optional[dict]:
    if not p:
        return None
    out = {"id": p.id, "tipo": p.tipo, "estado": p.estado, "resultado": p.resultado,
           "criado_em": _iso(p.criado_em), "feito_em": _iso(p.feito_em)}
    docs = _json(p.dados).get("documentos") if p.tipo == "gerar_documento" else None
    if docs:
        out["documentos"] = docs
    return out


def _ultimo_pedido(db: Session, sug_id: int) -> Optional[EscribaPedido]:
    return (db.query(EscribaPedido).filter(EscribaPedido.sugestao_id == sug_id)
            .order_by(EscribaPedido.id.desc()).first())


def _sug_out(db: Session, s: EscribaSugestao) -> dict:
    return {"id": s.id, "chave": s.chave, "tipo": s.tipo, "rotulo": s.rotulo, "frase": s.frase,
            "conferida": bool(s.conferida), "dados": _json(s.dados), "estado": s.estado,
            "atualizada_em": _iso(s.atualizada_em), "pedido": _pedido_out(_ultimo_pedido(db, s.id))}


class SugestaoIn(BaseModel):
    chave: str
    tipo: str
    rotulo: str
    frase: Optional[str] = None
    conferida: bool = False
    dados: dict = {}


class SugestoesIn(BaseModel):
    sugestoes: List[SugestaoIn] = []
    completo: bool = True   # True: o que nao veio nesta lista e ainda esta "nova" vira "sumiu"


@router.post("/ponte/sessoes/{sid}/sugestoes")
def ponte_sugestoes(sid: int, body: SugestoesIn, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """A ponte manda TODAS as sugestoes do rascunho atual. Idempotente pela chave.
    Nunca mexe no que o medico ja decidiu (feita ou descartada)."""
    s = db.query(EscribaSessao).filter(EscribaSessao.id == sid, EscribaSessao.organization_id == org).first()
    if not s:
        raise HTTPException(404, "Sessão não encontrada")
    atuais = {x.chave: x for x in db.query(EscribaSugestao).filter(EscribaSugestao.sessao_id == s.id).all()}
    vistas, cont = set(), {"novas": 0, "atualizadas": 0, "sumiram": 0}
    for it in body.sugestoes:
        chave = (it.chave or "").strip()[:120]
        if not chave or it.tipo not in TIPOS_SUG or chave in vistas:
            continue
        vistas.add(chave)
        dados = json.dumps(it.dados or {}, ensure_ascii=False)
        rot = (it.rotulo or "").strip()[:60] or it.tipo
        frase = (it.frase or "").strip()[:1000] or None
        x = atuais.get(chave)
        if not x:
            db.add(EscribaSugestao(organization_id=org, sessao_id=s.id, entry_id=s.entry_id, patient_id=s.patient_id,
                                   chave=chave, tipo=it.tipo, rotulo=rot, frase=frase, conferida=bool(it.conferida),
                                   dados=dados, estado="nova"))
            cont["novas"] += 1
            continue
        if x.estado in ("feita", "descartada"):
            continue  # o medico ja decidiu: nao muda nada
        if x.estado == "sumiu" or (x.rotulo, x.frase, bool(x.conferida), x.dados) != (rot, frase, bool(it.conferida), dados):
            x.rotulo, x.frase, x.conferida, x.dados = rot, frase, bool(it.conferida), dados
            if x.estado == "sumiu":
                x.estado = "nova"
            cont["atualizadas"] += 1
    if body.completo:
        for chave, x in atuais.items():
            if chave not in vistas and x.estado == "nova":
                x.estado = "sumiu"
                cont["sumiram"] += 1
    try:
        db.commit()
    except Exception:  # duas voltas da ponte ao mesmo tempo: a trava unica segura; a proxima volta acerta
        db.rollback()
        raise HTTPException(409, "Conflito; tente de novo")
    return cont


@router.get("/sugestoes/entrada/{entry_id}")
def sugestoes_da_entrada(entry_id: int, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """Os botoes da coluna para este atendimento (sem os que sumiram)."""
    e, p = _entrada_da_org(db, entry_id, u)
    conv = " ".join(x for x in (p.insurance, p.insurance_plan) if x) or None
    q = (db.query(EscribaSugestao).filter(EscribaSugestao.entry_id == e.id, EscribaSugestao.estado != "sumiu")
         .order_by(EscribaSugestao.id))
    return {"entry_id": e.id, "patient_id": p.id, "convenio": conv, "particular": eh_particular(p.insurance),
            "sugestoes": [_sug_out(db, x) for x in q.all()]}


def _sugestao_da_org(db: Session, sug_id: int, u: User) -> EscribaSugestao:
    x = db.query(EscribaSugestao).filter(EscribaSugestao.id == sug_id).first()
    if not x or not _mesma_org(u, x.organization_id):
        raise HTTPException(404, "Sugestão não encontrada")
    return x


class SugEstadoIn(BaseModel):
    estado: str
    sem_mudanca: Optional[bool] = None


@router.post("/sugestoes/{sug_id}/estado")
def mudar_estado_sugestao(sug_id: int, body: SugEstadoIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """aberta (clicou), feita (salvou o documento), descartada (x), nova (desfazer o x)."""
    if body.estado not in ESTADOS_MEDICO:
        raise HTTPException(422, "Use aberta, feita, descartada ou nova")
    x = _sugestao_da_org(db, sug_id, u)
    de, para = x.estado, body.estado
    pode = {"aberta": de == "nova",
            "feita": de in ("nova", "aberta"),
            "descartada": de in ("nova", "aberta", "sumiu"),
            "nova": de == "descartada"}[para]
    if pode:
        x.estado = para
        if para == "feita":
            x.feita_em = _agora()
            x.sem_mudanca = body.sem_mudanca
        db.commit()
        db.refresh(x)
    return _sug_out(db, x)


def _itens_da_guia(x: EscribaSugestao, d: dict) -> List[str]:
    """'DESCRICAO|QTD'. Exame: 1 por item (1 linha por lado). Fisio: so com o numero de sessoes DITO."""
    if x.tipo == "exame":
        return [f"{str(i).strip().upper()}|1" for i in (d.get("itens") or []) if str(i).strip()]
    n = d.get("sessoes")
    if not isinstance(n, int) or n <= 0:
        raise HTTPException(422, "Falta o número de sessões da fisioterapia (não foi dito). Faça a guia pela aba.")
    desc = (d.get("descricao_guia") or "FISIOTERAPIA").strip().upper()
    return [f"{desc}|{n}"]


@router.post("/sugestoes/{sug_id}/guia")
def pedir_guia(sug_id: int, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """'Gerar guia oficial (PC)'. So exame ou fisio de paciente de convenio. Repetir nao duplica:
    devolve o pedido que ja existe (a nao ser que o anterior tenha falhado)."""
    x = _sugestao_da_org(db, sug_id, u)
    if x.tipo not in ("exame", "fisio"):
        raise HTTPException(422, "Guia só para exame ou fisioterapia")
    p = db.query(Patient).filter(Patient.id == x.patient_id).first()
    if not p or eh_particular(p.insurance):
        raise HTTPException(422, "Paciente particular: use o pedido comum, sem guia")
    ja = _ultimo_pedido(db, x.id)
    if ja and ja.estado != "falhou":
        return _pedido_out(ja)
    d = _json(x.dados)
    itens = _itens_da_guia(x, d)
    if not itens:
        raise HTTPException(422, "Sem item para a guia")
    indicacao = (d.get("hd") or d.get("diagnostico") or "").strip()
    if not indicacao:
        raise HTTPException(422, "Falta a indicação clínica (HD). Faça a guia pela aba.")
    classe = d.get("classe") or "Exames"
    dados = {"patient_id": p.id, "indicacao": indicacao, "itens": itens, "convenio": p.insurance,
             "titulo": "Guia SADT - Fisioterapia" if x.tipo == "fisio" else f"Guia SADT - {classe}",
             # RNM e TC por convenio: a justificativa vai junto (feita do rascunho, so com fatos)
             "justificativa": d.get("justificativa") if x.tipo == "exame" and classe in ("Ressonância", "Tomografia") else None}
    novo = EscribaPedido(organization_id=x.organization_id or 1, patient_id=p.id, entry_id=x.entry_id, sugestao_id=x.id,
                         tipo="guia", dados=json.dumps(dados, ensure_ascii=False), doctor_user_id=u.id)
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return _pedido_out(novo)


# ── 17/11 02h10 (Valth): "imprimir tudo de hoje" com TODOS os botoes ──
# "Durante a consulta vao aparecendo os botoes, e todos os botoes eu quero clicar em 'imprimir tudo de hoje'.
#  Se uma das coisas eu nao tiver, ai eu desmarco la." Ao abrir o "Tudo de hoje", cada sugestao ainda nao feita
# nem descartada vira um pedido "gerar_documento" para o PC (o PC grava o documento de verdade pelo consulta.py).
# Idempotente por sugestao. Procedimento continua pela aba (como hoje). Atestado so com os dias ditos.

GERAVEIS = {"exame", "fisio", "receita", "encaminhamento", "atestado"}
PC_VIVO_S = 30                      # a ponte busca pedidos a cada 3 s; 30 s sem buscar = PC desligado
_PONTE_VISTA: dict = {}             # org -> ultima vez que a ponte buscou pedidos (1 worker no Render)
NAO_GERA = "NAO GERA:"              # o PC recusou por falta de dado dito: nao tenta de novo sozinho


def _motivo_pulo(x: EscribaSugestao) -> Optional[str]:
    d = _json(x.dados)
    if x.tipo == "procedimento":
        return "Procedimento: faça pela aba, como hoje"
    if x.tipo not in GERAVEIS:
        return "Sem documento automático"
    if x.tipo == "atestado" and not d.get("dias"):
        return "Atestado: os dias não foram ditos"
    return None


def _pedido_ativo(db: Session, sug_id: int) -> Optional[EscribaPedido]:
    """Ultimo pedido (guia do botao ou gerar_documento) desta sugestao."""
    return (db.query(EscribaPedido).filter(EscribaPedido.sugestao_id == sug_id,
                                           EscribaPedido.tipo.in_(("guia", "gerar_documento")))
            .order_by(EscribaPedido.id.desc()).first())


def _pc_vivo(org: int) -> bool:
    v = _PONTE_VISTA.get(org)
    return bool(v and (_agora() - v).total_seconds() < PC_VIVO_S)


def _gerar_out(db: Session, e: WaitingRoomEntry, org: int) -> dict:
    sugs = (db.query(EscribaSugestao).filter(EscribaSugestao.entry_id == e.id, EscribaSugestao.estado != "sumiu")
            .order_by(EscribaSugestao.id).all())
    itens, andando, cont = [], False, {"gerando": 0, "feitos": 0, "falhas": 0, "pulados": 0}
    for x in sugs:
        if x.estado == "descartada":
            continue
        ped = _pedido_ativo(db, x.id)
        motivo = None if (ped or x.estado == "feita") else _motivo_pulo(x)
        if ped and ped.estado in ("pendente", "pego"):
            andando = True
            cont["gerando"] += 1
        elif ped and ped.estado == "falhou" and x.estado != "feita":
            cont["falhas"] += 1
        elif (ped and ped.estado == "feito") or x.estado == "feita":
            cont["feitos"] += 1
        elif motivo:
            cont["pulados"] += 1
        itens.append({"sugestao_id": x.id, "tipo": x.tipo, "rotulo": x.rotulo, "estado": x.estado,
                      "pedido": _pedido_out(ped), "pulada": motivo})
    return {"entry_id": e.id, "pc_vivo": _pc_vivo(org), "terminado": not andando, **cont, "itens": itens}


@router.post("/sugestoes/entrada/{entry_id}/gerar-pendentes")
def gerar_pendentes(entry_id: int, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """Abre o "Tudo de hoje": cria 1 pedido gerar_documento por sugestao nova/aberta. Repetir nao duplica:
    sugestao com pedido andando ou feito fica como esta; falha por erro passageiro tenta de novo."""
    e, p = _entrada_da_org(db, entry_id, u)
    org = p.organization_id or 1
    q = (db.query(EscribaSugestao).filter(EscribaSugestao.entry_id == e.id,
                                          EscribaSugestao.estado.in_(("nova", "aberta")))
         .order_by(EscribaSugestao.id))
    novos = 0
    for x in q.all():
        if _motivo_pulo(x):
            continue
        ja = _pedido_ativo(db, x.id)
        if ja and (ja.estado != "falhou" or (ja.resultado or "").startswith(NAO_GERA)):
            continue
        dados = {"sugestao_id": x.id, "tipo": x.tipo, "rotulo": x.rotulo, "frase": x.frase, "conferida": bool(x.conferida),
                 "dados": _json(x.dados), "convenio": p.insurance, "convenio_plano": p.insurance_plan,
                 "particular": eh_particular(p.insurance), "clinic_id": e.clinic_id,
                 "data": (e.entry_date or today_br()).isoformat()}
        db.add(EscribaPedido(organization_id=x.organization_id or org, patient_id=p.id, entry_id=e.id, sugestao_id=x.id,
                             tipo="gerar_documento", dados=json.dumps(dados, ensure_ascii=False), doctor_user_id=u.id))
        novos += 1
    if novos:
        db.commit()
    return {**_gerar_out(db, e, org), "novos": novos}


@router.get("/sugestoes/entrada/{entry_id}/gerar-pendentes")
def gerar_pendentes_estado(entry_id: int, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """A tela acompanha ate terminar (terminado=True) ou ate desistir (PC desligado)."""
    e, p = _entrada_da_org(db, entry_id, u)
    return _gerar_out(db, e, p.organization_id or 1)


@router.get("/metrica")
def metrica(dias: int = 30, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    """Por dia: usadas sem mudar, mudadas, descartadas, total. Base para decidir o passo 2."""
    desde = _agora() - timedelta(days=max(1, min(dias, 365)))
    q = db.query(EscribaSugestao).filter(EscribaSugestao.criada_em >= desde, EscribaSugestao.estado != "sumiu")
    if u.role != "superadmin":
        q = q.filter(EscribaSugestao.organization_id == _org(u))
    br = timezone(timedelta(hours=-3))
    por_dia: dict = {}
    for x in q.all():
        dia = (_utc(x.criada_em) or _agora()).astimezone(br).date().isoformat()
        m = por_dia.setdefault(dia, {"dia": dia, "total": 0, "sem_mudar": 0, "mudadas": 0, "descartadas": 0, "abertas": 0})
        m["total"] += 1
        if x.estado == "feita":
            m["sem_mudar" if x.sem_mudanca else "mudadas"] += 1
        elif x.estado == "descartada":
            m["descartadas"] += 1
        elif x.estado == "aberta":
            m["abertas"] += 1
    return sorted(por_dia.values(), key=lambda m: m["dia"], reverse=True)


# ── pedidos para o PC (ponte) ──

@router.get("/ponte/pedidos")
def ponte_pedidos(db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """Pedidos pendentes (e os pegos ha mais de 10 min, que o PC largou no meio)."""
    _PONTE_VISTA[org] = _agora()
    velho = _agora() - timedelta(minutes=10)
    ps = (db.query(EscribaPedido).filter(EscribaPedido.organization_id == org,
                                         EscribaPedido.criado_em >= _agora() - timedelta(hours=14))
          .filter((EscribaPedido.estado == "pendente") | ((EscribaPedido.estado == "pego") & (EscribaPedido.pego_em < velho)))
          .order_by(EscribaPedido.id).limit(20).all())
    return [{"id": p.id, "tipo": p.tipo, "patient_id": p.patient_id, "entry_id": p.entry_id,
             "dados": _json(p.dados)} for p in ps]


def _pedido_da_ponte(db: Session, pid: int, org: int) -> EscribaPedido:
    p = db.query(EscribaPedido).filter(EscribaPedido.id == pid, EscribaPedido.organization_id == org).first()
    if not p:
        raise HTTPException(404, "Pedido não encontrado")
    return p


@router.post("/ponte/pedidos/{pid}/pegar")
def ponte_pegar_pedido(pid: int, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """So um PC executa: quem pega primeiro leva; o outro recebe 409."""
    p = _pedido_da_ponte(db, pid, org)
    pego = _utc(p.pego_em)
    if p.estado == "pendente" or (p.estado == "pego" and pego and _agora() - pego > timedelta(minutes=10)):
        p.estado, p.pego_em = "pego", _agora()
        db.commit()
        return {"ok": True, "id": p.id}
    raise HTTPException(409, "Pedido já pego ou terminado")


class ResultadoIn(BaseModel):
    ok: bool
    texto: str = ""
    # 17/11 (gerar pendentes): o que o PC gravou, ex. [{"kind": "receita", "id": 12}] (ou o que ja existia hoje)
    documentos: List[dict] = []


@router.post("/ponte/pedidos/{pid}/resultado")
def ponte_resultado_pedido(pid: int, body: ResultadoIn, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    p = _pedido_da_ponte(db, pid, org)
    if p.estado in ("feito", "falhou"):
        return _pedido_out(p)
    p.estado = "feito" if body.ok else "falhou"
    p.resultado = (body.texto or "")[:2000]
    p.feito_em = _agora()
    if p.tipo == "gerar_documento":
        d = _json(p.dados)
        d["documentos"] = [{"kind": str(x.get("kind") or "")[:20], "id": x.get("id"),
                            "ja_existia": bool(x.get("ja_existia"))} for x in (body.documentos or [])[:10]
                           if isinstance(x, dict)]
        p.dados = json.dumps(d, ensure_ascii=False)
        x = db.query(EscribaSugestao).filter(EscribaSugestao.id == p.sugestao_id).first() if p.sugestao_id else None
        # documento pronto (ou ja existia hoje): o botao fica "feito", igual ao clique do medico
        if body.ok and x and x.estado in ("nova", "aberta"):
            x.estado, x.feita_em, x.sem_mudanca = "feita", _agora(), True
    db.commit()
    db.refresh(p)
    return _pedido_out(p)


# ── resumo automatico da coluna (17/11): a ponte grava sozinha a cada rascunho novo ──

def _sessao_da_ponte(db: Session, sid: int, org: int) -> EscribaSessao:
    s = db.query(EscribaSessao).filter(EscribaSessao.id == sid, EscribaSessao.organization_id == org).first()
    if not s:
        raise HTTPException(404, "Sessão não encontrada")
    return s


def _dia_da_sessao(db: Session, s: EscribaSessao):
    e = db.query(WaitingRoomEntry).filter(WaitingRoomEntry.id == s.entry_id).first()
    return (e.entry_date if e and e.entry_date else today_br())


@router.get("/ponte/sessoes/{sid}/anamnese-hoje")
def ponte_anamnese_hoje(sid: int, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """So o texto que o MEDICO escreveu hoje para o paciente deste atendimento (sem o bloco do Escriba)."""
    from models.clinical_evolution import ClinicalEvolution
    s = _sessao_da_ponte(db, sid, org)
    dia = _dia_da_sessao(db, s)
    evs = (db.query(ClinicalEvolution).filter(ClinicalEvolution.patient_id == s.patient_id,
                                              ClinicalEvolution.entry_date == dia)
           .order_by(ClinicalEvolution.id).all())
    texto = "\n".join((e.content or "") for e in evs if (e.organization_id or 1) == org)
    # o bloco "[ESCRIBA IA – conferir]" e da IA, nao do medico
    import re as _re
    texto = _re.sub(r"\n*\[ESCRIBA IA[^\n]*(?:\n(?:QP|HDA|Antecedentes|Exames trazidos|EF|HD|CD): [^\n]*)*", "", texto)
    return {"patient_id": s.patient_id, "data": dia.isoformat(), "texto": texto}


class ResumoPonteIn(BaseModel):
    linhas: List[str] = []
    faltas: List[str] = []


@router.put("/ponte/sessoes/{sid}/resumo")
def ponte_resumo(sid: int, body: ResumoPonteIn, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """Igual ao PUT /patients/{id}/escriba-resumo, com a chave da ponte. Grava com fonte='auto'.
    Nao grava se nada mudou e nunca escreve por cima do que a sessao Claude gravou no mesmo dia."""
    from models.clinical_evolution import EscribaResumo
    s = _sessao_da_ponte(db, sid, org)
    dia = _dia_da_sessao(db, s)
    linhas = [l.strip()[:500] for l in body.linhas if l and l.strip()][:30]
    faltas = [l.strip()[:500] for l in body.faltas if l and l.strip()][:15]
    r = db.query(EscribaResumo).filter(EscribaResumo.patient_id == s.patient_id, EscribaResumo.entry_date == dia).first()
    if r and (r.fonte or "sessao") == "sessao":
        return {"gravado": False, "motivo": "sessao"}
    nl, nf = json.dumps(linhas, ensure_ascii=False), json.dumps(faltas, ensure_ascii=False)
    if r and r.linhas == nl and r.faltas == nf:
        return {"gravado": False, "motivo": "igual"}
    if not r:
        r = EscribaResumo(patient_id=s.patient_id, entry_date=dia, organization_id=org)
        db.add(r)
    r.linhas, r.faltas, r.fonte = nl, nf, "auto"
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Conflito; tente de novo")
    return {"gravado": True}


# ── 17/11 02h35 (Valth): avisos automaticos e respostas no "Assistente ao vivo", escritos pelo PC ──
# A ponte le a ficha (alergia, remedios em uso, comorbidades, idade) e as mensagens do dia, e grava como 'ia'.
# Mesmo filtro de organizacao da chave da ponte (_sessao_da_ponte).

def _idade(nasc) -> Optional[int]:
    if not nasc:
        return None
    h = today_br()
    return h.year - nasc.year - ((h.month, h.day) < (nasc.month, nasc.day))


@router.get("/ponte/sessoes/{sid}/ficha")
def ponte_ficha(sid: int, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """So o que os avisos precisam: alergia, remedios em uso, comorbidades, idade, sexo e convenio."""
    s = _sessao_da_ponte(db, sid, org)
    p = db.query(Patient).filter(Patient.id == s.patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    return {"patient_id": p.id, "allergies": p.allergies or p.alergias or "", "current_medications": p.current_medications or "",
            "medicacoes_uso_continuo": p.medicacoes_uso_continuo or [], "comorbidades": p.comorbidades or {},
            "chronic_conditions": p.chronic_conditions or "", "contraindicacoes": p.contraindicacoes or "",
            "cids": p.cids or [], "idade": _idade(p.birthdate), "sexo": p.gender,
            "peso_kg": float(p.peso_kg) if p.peso_kg is not None else None,
            "convenio": " ".join(x for x in (p.insurance, p.insurance_plan) if x) or None}


@router.get("/ponte/sessoes/{sid}/assistente")
def ponte_assistente_listar(sid: int, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    from models.assistente import AssistenteMensagem
    s = _sessao_da_ponte(db, sid, org)
    q = (db.query(AssistenteMensagem).filter(AssistenteMensagem.patient_id == s.patient_id,
                                             AssistenteMensagem.data == _dia_da_sessao(db, s))
         .order_by(AssistenteMensagem.id).limit(300))
    return [{"id": m.id, "autor": m.autor, "texto": m.texto, "criado_em": _iso(m.criado_em)} for m in q.all()]


class AssistentePonteIn(BaseModel):
    texto: str
    # 'medico' so para a pergunta FALADA ("assistente, ..."), que vem com o prefixo do microfone
    autor: str = "ia"


@router.post("/ponte/sessoes/{sid}/assistente")
def ponte_assistente(sid: int, body: AssistentePonteIn, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    """Grava como 'ia'. O mesmo texto no mesmo dia nao entra duas vezes (a ponte pode reiniciar)."""
    from models.assistente import AssistenteMensagem
    s = _sessao_da_ponte(db, sid, org)
    texto = (body.texto or "").strip()[:4000]
    if not texto:
        raise HTTPException(422, "Texto vazio")
    autor = body.autor if body.autor in ("ia", "medico") else "ia"
    if autor == "medico" and not texto.startswith("🎙"):
        raise HTTPException(422, "Pela ponte, 'medico' so a pergunta falada (prefixo do microfone)")
    dia = _dia_da_sessao(db, s)
    ja = (db.query(AssistenteMensagem).filter(AssistenteMensagem.patient_id == s.patient_id, AssistenteMensagem.data == dia,
                                              AssistenteMensagem.autor == autor, AssistenteMensagem.texto == texto).first())
    if ja:
        return {"id": ja.id, "gravado": False}
    m = AssistenteMensagem(organization_id=org, patient_id=s.patient_id, data=dia, autor=autor, texto=texto)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id, "gravado": True}




# 17/11 (Valth, testes): os botoes do dia de um paciente somem (estado 'sumiu'); nada e apagado.
@router.delete("/sugestoes/paciente/{patient_id}")
def limpar_sugestoes_do_dia(patient_id: int, data: Optional[str] = None, db: Session = Depends(get_db),
                            u: User = Depends(require_doctor)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p or not _mesma_org(u, p.organization_id):
        raise HTTPException(404, "Paciente não encontrado")
    dia = data or today_br().isoformat()
    entradas = [e.id for e in db.query(WaitingRoomEntry).filter(WaitingRoomEntry.patient_id == p.id).all()
                if e.entry_date and e.entry_date.isoformat() == dia]
    n = 0
    if entradas:
        for x in db.query(EscribaSugestao).filter(EscribaSugestao.entry_id.in_(entradas), EscribaSugestao.estado != "sumiu").all():
            x.estado = "sumiu"
            n += 1
        db.commit()
    return {"sumiram": n}
