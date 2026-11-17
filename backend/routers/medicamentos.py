"""
Base de medicamentos do Brasil. Prefixo: /medicamentos

13/10/2026 (Valth): "Antigamente eu trabalhava em farmácia e tinha um fichário
com todos os nomes comerciais" — a base vem da lista de preços da CMED (Anvisa,
26 mil apresentações) cruzada com o Anexo I da Portaria 344 (RDC 1.036/2026).
O app usa os TERMOS para decidir sozinho o tipo de receita quando ele escreve a
marca (Adorlan, Nusira, Insit, Cymbi...). Carga e atualização mensal:
ortho-clinic-backup/cmed/ (montar_base.py, termos.py, carregar_banco.py).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.organization import User

router = APIRouter(prefix="/medicamentos", tags=["medicamentos"])


@router.get("/termos")
def termos_controlados(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Marca ou princípio -> tipo de receita (só os que NÃO são receita simples)."""
    try:
        rows = db.execute(text("select termo, tipo, notificacao, principio from medicamento_termos")).fetchall()
    except Exception:
        return []
    return [{"termo": r[0], "tipo": r[1], "notificacao": r[2], "principio": r[3]} for r in rows]


@router.get("/busca")
def buscar(q: str = Query(..., min_length=3), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Procura por marca ou princípio ativo (até 40 apresentações)."""
    termo = f"%{q.strip().lower()}%"
    rows = db.execute(text(
        "select produto, substancia, apresentacao, laboratorio, tipo_receita, notificacao, lista344, pmc_pe, classe "
        "from medicamentos where lower(produto) like :t or lower(substancia) like :t "
        # marca que COMEÇA com o que ele digitou vem primeiro (como na Memed)
        "order by (lower(produto) like :ini) desc, produto, apresentacao limit 60"),
        {"t": termo, "ini": f"{q.strip().lower()}%"}).fetchall()
    return [dict(zip(["produto", "substancia", "apresentacao", "laboratorio", "tipo_receita",
                      "notificacao", "lista344", "preco_maximo_pe", "classe"], r)) for r in rows]


# 03/11/2026 (Valth): "sempre que tiver uma substância que necessite de 2 vias", a receita
# e o modelo vão em 2 vias — o MANI ESPECIAL (fórmula com tramadol, pregabalina e duloxetina)
# estava gravado como simples. Trava no servidor: só SOBE o tipo (simples -> 2 vias), nunca desce.
import json as _json
import re as _re
import time as _time
import unicodedata as _ud

_CACHE = {"em": 0.0, "termos": []}


def _sem_acento(s: str) -> str:
    return _ud.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def tipo_exigido(db: Session, *partes) -> "str | None":
    """'controle_especial' ou 'antimicrobiano' se algum termo da base aparece no texto; senão None."""
    if _time.time() - _CACHE["em"] > 3600:
        try:
            rows = db.execute(text("select termo, tipo from medicamento_termos")).fetchall()
            _CACHE["termos"] = [(_re.compile(r"\b" + _re.escape(_sem_acento(t)) + r"\b"), tp) for t, tp in rows if t and len(t) > 3]
            _CACHE["em"] = _time.time()
        except Exception:
            return None
    alvo = _sem_acento(" ".join(p if isinstance(p, str) else _json.dumps(p, ensure_ascii=False, default=str) for p in partes))
    tipos = {tp for rx, tp in _CACHE["termos"] if rx.search(alvo)}
    if tipos - {"antimicrobiano", "simples"}:
        return "controle_especial"
    return "antimicrobiano" if "antimicrobiano" in tipos else None


# 17/11/2026 (Valth): "o programa vai ser vendido a todos os médicos; não dá para ele dizer marca por marca".
# Composição de QUALQUER marca pela base pública da ANVISA (Dados Abertos, só registro Ativo), arquivo versionado
# em data/medicamentos_anvisa.json (gerado por scripts/gerar_tabela_anvisa.py). Mesma tabela do PC do Escriba.
import gzip as _gzip
from pathlib import Path as _Path

_ANVISA_ARQ = _Path(__file__).resolve().parent.parent / "data" / "medicamentos_anvisa.json"
_ANVISA = {"marcas": None}


def _norm_busca(s: str) -> str:
    return " ".join(_re.sub(r"[^a-z0-9]+", " ", _sem_acento(s)).split())


def _anvisa() -> dict:
    if _ANVISA["marcas"] is None:
        marcas = {}
        for arq in (_ANVISA_ARQ, _ANVISA_ARQ.with_suffix(".json.gz")):
            try:
                bruto = _gzip.decompress(arq.read_bytes()) if arq.suffix == ".gz" else arq.read_bytes()
                marcas = _json.loads(bruto.decode("utf-8")).get("marcas") or {}
                break
            except OSError:
                continue
        _ANVISA["marcas"] = {k: ([v] if isinstance(v, str) else list(v)) for k, v in marcas.items()}
    return _ANVISA["marcas"]


def buscar_composicao(q: str, limite: int = 5) -> list:
    """Marcas que começam com o que foi digitado (ou com palavra dela começando assim). Exata primeiro."""
    pal = [w for w in _norm_busca(q).split() if not _re.search(r"\d", w)]   # "insit 75mg" -> "insit"
    for n in range(min(len(pal), 4), 0, -1):   # "ketto sl" sem marca assim -> tenta "ketto"
        r = _buscar_alvo(" ".join(pal[:n]), limite)
        if r:
            return r
    return []


def _buscar_alvo(alvo: str, limite: int) -> list:
    if len(alvo) < 3:
        return []
    marcas = _anvisa()
    achados = []
    for nome, comps in marcas.items():
        if nome == alvo:
            nivel = 0
        elif nome.startswith(alvo):
            nivel = 1
        elif (" " + alvo) in (" " + nome):   # começo de outra palavra da marca
            nivel = 2
        else:
            continue
        achados.append((nivel, len(nome), nome, comps))
    achados.sort()
    return [{"marca": nome.upper(), "composicao": comps[0], "outras": comps[1:]} for _n, _l, nome, comps in achados[:limite]]


@router.get("/composicao")
def composicao(q: str = Query(..., min_length=2, max_length=80), current_user: User = Depends(get_current_user)):
    """Marca digitada -> princípio(s) ativo(s) (ANVISA). Ex.: 'insit' -> [{'marca': 'INSIT', 'composicao': 'pregabalina'}]."""
    return buscar_composicao(q)
