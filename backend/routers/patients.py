from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
import os, uuid, re, unicodedata, base64, json, logging
import httpx
from services.storage import upload_file
from database import get_db
from models.patient import Patient
from services.telefone_br import (
    normalizar as normalizar_telefone,
    validar as validar_telefone,
)
from models.consultation import Consultation
from models.organization import User
from schemas.patient import PatientCreate, PatientUpdate, PatientOut, PatientSummary
from deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patients", tags=["patients"])

UPLOAD_DIR = "uploads/photos"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _org_filter(q, current_user: User):
    """Filtra por organização, exceto para superadmin."""
    if current_user.role != "superadmin":
        q = q.filter(Patient.organization_id == current_user.organization_id)
    return q


def _normalize_name(name: Optional[str]) -> str:
    """Normaliza nome p/ dedup soft: sem acento, minúsculo, espaços colapsados."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    sem_acento = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sem_acento).strip().lower()


def _redact_clinical_for_secretary(result: PatientOut, current_user: User) -> PatientOut:
    """LGPD/confidencialidade: a secretaria vê o cadastro operacional, mas NÃO o
    histórico clínico (medicação em uso, condições crônicas, cirurgias, história
    familiar, observações). Alergias e tipo sanguíneo permanecem por serem
    segurança operacional."""
    if current_user.role == "secretary":
        result.chronic_conditions = None
        result.current_medications = None
        result.surgeries_history = None
        result.family_history = None
        result.notes = None
    return result


@router.get("", response_model=List[PatientSummary])
def list_patients(
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.active == True)
    q = _org_filter(q, current_user)
    if search:
        term = f"%{search}%"
        conds = [Patient.name.ilike(term), Patient.cpf.ilike(term), Patient.phone.ilike(term)]
        # 02/10: busca ignorava acento — "QUITERIA" não achava "Quitéria" e a
        # secretária cadastrava de novo. No Postgres compara sem acento.
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            com, sem = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ", "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC"
            sem_acento = _normalize_name(search)
            if sem_acento:
                conds.append(func.translate(Patient.name, com, sem).ilike(f"%{sem_acento}%"))
                # 08/10: nome salvo com espaço duplo não casava com a busca do nome inteiro.
                conds.append(func.regexp_replace(func.translate(Patient.name, com, sem), r"\s+", " ", "g")
                             .ilike("%" + re.sub(r"\s+", " ", sem_acento).strip() + "%"))
            # 08/10 (Valth): buscar pelo CPF com ou sem pontos — o banco guarda dos dois jeitos.
            dig = re.sub(r"\D", "", search)
            if len(dig) >= 6:
                conds.append(func.regexp_replace(Patient.cpf, r"\D", "", "g").like(f"%{dig}%"))
        # Telefone digitado com máscara/DDD/+55: compara pelos últimos 8 dígitos.
        fone = _ultimos8(search)
        if fone and len(re.sub(r"\D", "", search)) >= 8:
            conds.append(Patient.phone.like(f"%{fone}%"))
        q = q.filter(or_(*conds))
    patients = q.order_by(Patient.name).offset(skip).limit(limit).all()

    result = []
    for p in patients:
        count = db.query(func.count(Consultation.id)).filter(Consultation.patient_id == p.id).scalar()
        summary = PatientSummary.model_validate(p)
        summary.consultation_count = count
        result.append(summary)
    return result


# O que a secretaria NAO pode deixar em branco. Ordem = ordem da tela.
CADASTRO_OBRIGATORIO = [
    ("name", "Nome completo"),
    ("cpf", "CPF"),
    ("phone", "Telefone / WhatsApp"),
    ("address_street", "Endereço"),
    ("address_city", "Cidade"),
    ("address_state", "Estado (UF)"),
    ("insurance", "Particular ou convênio"),
]


def _exigir_cadastro_completo(data, current_user: User) -> None:
    """Secretaria so cadastra paciente com o essencial preenchido.

    Devolve TODOS os campos que faltam de uma vez — devolver um por vez faz a
    secretaria descobrir o proximo so depois de corrigir o anterior.
    """
    if current_user.role != "secretary":
        return

    faltando = [
        rotulo for campo, rotulo in CADASTRO_OBRIGATORIO
        if not str(getattr(data, campo, "") or "").strip()
    ]
    if faltando:
        raise HTTPException(
            422,
            "Cadastro incompleto — preencha: " + ", ".join(faltando) +
            ". Se o paciente não tiver o dado agora, peça na chegada.",
        )

    if not _cpf_valido(str(getattr(data, "cpf", "") or "")):
        raise HTTPException(422, "CPF inválido — confira os números digitados.")


def _ultimos8(fone: Optional[str]) -> str:
    d = re.sub(r"\D", "", fone or "")
    return d[-8:] if len(d) >= 8 else ""


def _cadastro_esqueleto_do_bot(db: Session, data, current_user: User) -> Optional[Patient]:
    """Cadastro já existente da MESMA pessoa: mesmo nome normalizado + mesmo
    telefone (últimos 8 dígitos), sem CPF e com nascimento vazio ou igual.
    É o formato do cadastro que o bot cria — só nome e telefone."""
    nome = _normalize_name(data.name)
    fone = _ultimos8(getattr(data, "phone", None))
    if not nome or not fone:
        return None
    candidatos = _org_filter(
        db.query(Patient).filter(Patient.active == True, Patient.phone.isnot(None)),
        current_user,
    ).filter(Patient.phone.like(f"%{fone}")).all()
    for c in candidatos:
        if _normalize_name(c.name) != nome:
            continue
        if (c.cpf or "").strip():
            continue
        if c.birthdate and getattr(data, "birthdate", None) and c.birthdate != data.birthdate:
            continue
        return c
    return None


def _arrumar_telefones(data) -> None:
    """Conserta o que da para consertar e recusa o que nao e telefone.

    Antes o campo aceitava qualquer coisa: a Maria do Socorro ficou com um
    numero de carteirinha no lugar do telefone (20/08) e ninguem soube, ate a
    mensagem nao chegar. Zero antigo antes do DDD (083...) e +55 sao arrumados
    em silencio; o que nao e telefone e recusado com o motivo em portugues.
    """
    for campo in ("phone", "phone2", "emergency_phone"):
        bruto = getattr(data, campo, None)
        if bruto is None or not str(bruto).strip():
            continue
        erro = validar_telefone(bruto)
        if erro:
            rotulo = {"phone": "Telefone", "phone2": "Telefone 2",
                      "emergency_phone": "Telefone de emergência"}[campo]
            raise HTTPException(422, f"{rotulo}: {erro}")
        setattr(data, campo, normalizar_telefone(bruto))


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    data: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _arrumar_telefones(data)
    # 08/10 (Sandra, CTO): "NARILUCE DA SILVA  BEZERRA" (letra trocada + espaço
    # duplo) não aparecia ao buscar "Mariluce"; no 2º cadastro só vinha "CPF já
    # cadastrado", sem dizer em nome de quem. Espaço duplo some e o aviso nomeia.
    if data.name:
        data.name = re.sub(r"\s+", " ", data.name).strip()
    _exigir_cadastro_completo(data, current_user)
    if data.cpf:
        digitos = re.sub(r"\D", "", data.cpf)
        existing = next((p for p in _org_filter(
            db.query(Patient).filter(Patient.cpf.isnot(None)), current_user,
        ).all() if re.sub(r"\D", "", p.cpf or "") == digitos), None) if digitos else None
        if existing:
            raise HTTPException(
                400,
                f"CPF já cadastrado: {existing.name} (código {existing.id}). "
                "Busque por esse nome — se estiver escrito errado, corrija o nome nesse cadastro.",
            )

    # 02/10 (Valth): o bot do WhatsApp cria o paciente só com NOME + TELEFONE
    # ("confirmação de presença"). No balcão a secretária buscava "QUITERIA",
    # não achava "Quitéria" (busca sensível a acento) e cadastrava de novo —
    # 4 duplicados só em 30/09, com a marcação do bot presa num cadastro e o
    # atendimento no outro. Se já existe cadastro ativo com o MESMO nome
    # (sem acento/caixa) e o MESMO telefone, sem CPF e sem data de nascimento
    # conflitante, ele é COMPLETADO com os dados novos em vez de duplicado.
    esqueleto = _cadastro_esqueleto_do_bot(db, data, current_user)
    if esqueleto is not None:
        for campo, valor in data.model_dump(exclude_unset=True).items():
            if valor in (None, "", []):
                continue
            atual = getattr(esqueleto, campo, None)
            if campo == "name" or atual in (None, "", []):
                setattr(esqueleto, campo, valor)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(400, "CPF já cadastrado")
        db.refresh(esqueleto)
        result = PatientOut.model_validate(esqueleto)
        result.warning = (
            f"Este paciente já tinha cadastro (id {esqueleto.id}, criado pela "
            "confirmação do WhatsApp). Completei o cadastro existente em vez de criar outro."
        )
        return result

    # A19-back: dedup SOFT por (nome normalizado + data de nascimento) na org.
    # Cadastro rápido sem CPF não pega homônimos via constraint, então avisamos
    # sem bloquear. Contrato com o front: quando há possível duplicata, o campo
    # 'warning' do retorno vem preenchido (string); caso contrário vem null.
    warning: Optional[str] = None
    norm = _normalize_name(data.name)
    if norm and data.birthdate:
        candidatos = _org_filter(
            db.query(Patient).filter(
                Patient.active == True,
                Patient.birthdate == data.birthdate,
            ),
            current_user,
        ).all()
        similar = next((c for c in candidatos if _normalize_name(c.name) == norm), None)
        if similar:
            warning = (
                f"Já existe paciente com mesmo nome e data de nascimento "
                f"(id {similar.id}). Verifique se não é duplicado."
            )

    patient = Patient(**data.model_dump(), organization_id=current_user.organization_id)
    db.add(patient)
    # M20: cpf é unique GLOBAL, mas o dedup acima filtra por org; um CPF já usado
    # em OUTRA organização estoura IntegrityError. Capturamos p/ retornar 400 em
    # vez de 500. RECOMENDAÇÃO (mantenedor): trocar a unique global de cpf por
    # constraint composta (organization_id, cpf) — não feito aqui p/ não arriscar
    # dados existentes; exige migração/ALTER TABLE dedicado.
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "CPF já cadastrado")
    db.refresh(patient)

    result = PatientOut.model_validate(patient)
    result.warning = warning
    return result


# ── Cadastro por foto (06/08) ────────────────────────────────────────────────
# As secretárias cadastravam o mesmo paciente duas vezes: no sistema antigo e
# aqui. Elas colam o print da ficha do outro sistema e a IA lê os campos.
#
# SIGILO: a imagem vive só na memória durante a chamada. Não é gravada em
# banco, em disco nem em log — decisão explícita do Valth em 06/08.

LER_FOTO_MAX_BYTES = 6 * 1024 * 1024
LER_FOTO_TIPOS = {"image/png", "image/jpeg", "image/webp"}

# Campos que a IA pode devolver. Qualquer chave fora desta lista é descartada:
# o modelo não escolhe o que grava no cadastro.
LER_FOTO_CAMPOS = (
    "name", "cpf", "birthdate", "phone", "address_street",
    "address_neighborhood", "address_city", "address_state", "address_zip",
    "insurance", "insurance_number",
)

LER_FOTO_PROMPT = """Você recebe a imagem da ficha de cadastro de um paciente, tirada de outro sistema médico.

Extraia os dados e responda SOMENTE com um objeto JSON, sem nenhum texto antes ou depois, com estas chaves:
name, cpf, birthdate, phone, address_street, address_neighborhood, address_city, address_state, address_zip, insurance, insurance_number

Regras obrigatórias:
- Use null em todo campo que NÃO estiver claramente visível na imagem.
- NUNCA invente, deduza ou complete um dado que não esteja escrito. Campo vazio é melhor que campo errado.
- name: nome completo em CAIXA ALTA.
- cpf: somente os 11 dígitos, sem pontos nem traço.
- birthdate: no formato AAAA-MM-DD.
- phone: somente dígitos, com DDD.
- address_street: logradouro e número, sem bairro.
- address_state: a sigla da UF com 2 letras.
- address_zip: somente os 8 dígitos.
- insurance: nome do convênio; use "Particular" se a ficha indicar particular.
"""


def _cpf_valido(cpf: str) -> bool:
    """Confere os dígitos verificadores do CPF.

    É o campo que a leitura mais erra (um dígito trocado num print), e um CPF
    errado no cadastro é pior que um CPF ausente.
    """
    d = re.sub(r"\D", "", cpf or "")
    if len(d) != 11 or d == d[0] * 11:
        return False
    for tamanho in (9, 10):
        soma = sum(int(d[i]) * (tamanho + 1 - i) for i in range(tamanho))
        resto = (soma * 10) % 11 % 10
        if resto != int(d[tamanho]):
            return False
    return True


# ── Leitura de DOCUMENTO PESSOAL e CARTEIRINHA (app do celular, 22/11/2026) ──
# Mesmo sigilo da ficha: a imagem só passa pela memória, nada é gravado.
# As regras estão no prompt E conferidas aqui no código: o modelo devolve, para
# cada campo, o valor e o texto da linha de onde tirou; o código descarta o que
# vem de linha de titular/responsável, CPF sem rótulo, data impossível etc.

LER_DOC_TIPOS = ("identity", "insurance_card")
LER_DOC_CAMPOS = {
    "identity": ("name", "birthdate", "cpf", "rg"),
    "insurance_card": ("insurance", "insurance_plan", "insurance_number", "name", "birthdate", "cpf"),
}
LER_DOC_ESPERA_S = 20.0

_LER_DOC_REGRAS = """
Para CADA campo devolva um objeto com estas chaves:
  "valor": o dado lido (ou null),
  "rotulo": o rótulo impresso ao lado ou acima do dado (ex.: "CPF", "NOME", "NASCIMENTO"), ou null,
  "linha": o texto exato da linha onde o dado está,
  "linha_abaixo": o texto exato da linha logo abaixo, ou null,
  "duvidoso": true se você não tem certeza da leitura.

Regras obrigatórias:
- Responda SOMENTE com um objeto JSON, sem nenhum texto antes ou depois.
- Use null em todo campo que NÃO estiver claramente visível. NUNCA invente, deduza ou complete.
- Linha com TITULAR, TIT., RESPONSÁVEL ou RESP. NUNCA é dado do paciente: deixe o campo null.
- "Dependente" ou "Beneficiário" é o paciente: o nome dele vai em name.
- name: nome completo em CAIXA ALTA.
- cpf: somente os 11 dígitos. Só leia o CPF se ele tiver o rótulo "CPF".
- birthdate: no formato AAAA-MM-DD.
- Na dúvida, marque "duvidoso": true.
"""

LER_DOC_PROMPTS = {
    "identity": (
        "Você recebe a foto de um documento pessoal brasileiro (RG, CNH ou CPF) de um paciente.\n"
        "Chaves do JSON: name, birthdate, cpf, rg.\n"
        "- rg: o número do RG como está escrito (com o órgão emissor, se houver).\n"
        + _LER_DOC_REGRAS
    ),
    "insurance_card": (
        "Você recebe a foto da carteirinha do plano de saúde de um paciente.\n"
        "Chaves do JSON: insurance, insurance_plan, insurance_number, name, birthdate, cpf.\n"
        "- insurance: nome da operadora (ex.: Unimed, Bradesco Saúde, Hapvida).\n"
        "- insurance_plan: nome do plano ou produto impresso na carteirinha.\n"
        "- insurance_number: número da carteirinha (do beneficiário), somente dígitos.\n"
        "- name e birthdate: do beneficiário (o paciente), nunca do titular.\n"
        "- cpf: só se houver o rótulo \"CPF\" e a linha de baixo não disser TIT. ou RESP.\n"
        + _LER_DOC_REGRAS
    ),
}

_RE_TITULAR = re.compile(r"\b(TITULAR|TIT|RESPONS[AÁ]VEL|RESP)\b\.?", re.I)

_travas_leitura: dict = {}


def _trava_leitura():
    """Uma leitura do celular por vez (uma trava por laço de eventos)."""
    import asyncio
    laco = asyncio.get_running_loop()
    t = _travas_leitura.get(id(laco))
    if t is None or t[0] is not laco:
        t = (laco, asyncio.Lock())
        _travas_leitura[id(laco)] = t
    return t[1]


def _conferir_campo(tipo: str, campo: str, item) -> tuple:
    """Devolve (valor, motivo). valor None = não entra; motivo explica o porquê."""
    from datetime import date as _date
    if isinstance(item, dict):
        valor, rotulo = item.get("valor"), item.get("rotulo")
        linha, abaixo, duvidoso = item.get("linha"), item.get("linha_abaixo"), item.get("duvidoso")
    else:
        valor, rotulo, linha, abaixo, duvidoso = item, None, None, None, False
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None, None
    valor = str(valor).strip()
    if duvidoso is True:
        return None, "leitura duvidosa"
    junto = " ".join(str(x) for x in (rotulo, linha) if x)
    if _RE_TITULAR.search(junto) or _RE_TITULAR.search(valor):
        return None, "é do titular ou responsável, não do paciente"

    if campo == "cpf":
        if tipo == "insurance_card":
            if not rotulo or "CPF" not in str(rotulo).upper():
                return None, "CPF sem o rótulo CPF"
            if abaixo and _RE_TITULAR.search(str(abaixo)):
                return None, "CPF do titular ou responsável"
        d = re.sub(r"\D", "", valor)
        if not _cpf_valido(d):
            return None, "CPF com dígito errado"
        return d, None
    if campo == "birthdate":
        try:
            dt = _date.fromisoformat(valor[:10])
        except ValueError:
            return None, "data ilegível"
        if dt < _date(1900, 1, 1) or dt > _date.today():
            return None, "data impossível"
        return dt.isoformat(), None
    if campo == "insurance_number":
        d = re.sub(r"\D", "", valor)
        if not (6 <= len(d) <= 20):
            return None, "número da carteirinha fora do tamanho"
        return d, None
    if campo == "name":
        nome = re.sub(r"\s+", " ", valor).upper()
        if len(nome) < 3 or re.search(r"\d", nome):
            return None, "nome ilegível"
        return nome, None
    if campo == "rg":
        # a coluna rg tem 20 caracteres: maior que isso estourava 500 ao salvar
        rg = re.sub(r"\s+", " ", valor)
        if len(rg) > 20:
            return None, "RG maior que 20 caracteres"
        return rg, None
    return valor[:100], None


async def _ler_documento(file: UploadFile, tipo: str) -> dict:
    """Leitura de documento pessoal ou carteirinha. NÃO grava nada."""
    import asyncio
    if file.content_type not in LER_FOTO_TIPOS:
        raise HTTPException(422, "Formato não aceito. Envie uma foto PNG, JPG ou WEBP.")
    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(422, "A foto chegou vazia. Tire de novo.")
    if len(conteudo) > LER_FOTO_MAX_BYTES:
        raise HTTPException(422, "Foto muito grande (máximo 6 MB).")
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(503, "Leitura por foto não configurada (ANTHROPIC_API_KEY ausente)")

    trava = _trava_leitura()
    try:
        await asyncio.wait_for(trava.acquire(), timeout=LER_DOC_ESPERA_S)
    except asyncio.TimeoutError:
        conteudo = b""
        raise HTTPException(429, "A leitura está ocupada. Tente de novo.")
    try:
        payload = {
            "model": "claude-opus-4-8",
            "max_tokens": 1500,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": file.content_type,
                        "data": base64.b64encode(conteudo).decode(),
                    }},
                    {"type": "text", "text": LER_DOC_PROMPTS[tipo]},
                ],
            }],
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json=payload,
            )
    except httpx.RequestError as exc:
        logger.error("Erro de rede ao ler documento: %s", type(exc).__name__)
        raise HTTPException(502, "Não consegui falar com o serviço de leitura. Tente de novo.")
    finally:
        conteudo = b""
        payload = None
        trava.release()

    if resp.status_code != 200:
        logger.error("Anthropic retornou %s na leitura de documento", resp.status_code)
        raise HTTPException(502, "Serviço de leitura indisponível no momento. Tente de novo.")

    vazio = {"tipo": tipo, "campos": {k: None for k in LER_DOC_CAMPOS[tipo]}, "motivos": {},
             "cpf_valido": None, "lidos": [],
             "aviso": "Não consegui ler essa foto. Tente uma foto mais nítida."}
    texto = "".join(b.get("text", "") for b in resp.json().get("content", []) if b.get("type") == "text").strip()
    achado = re.search(r"\{.*\}", texto, re.S)
    if not achado:
        return vazio
    try:
        bruto = json.loads(achado.group(0))
    except json.JSONDecodeError:
        return vazio
    if not isinstance(bruto, dict):
        return vazio

    campos, motivos = {}, {}
    for k in LER_DOC_CAMPOS[tipo]:
        valor, motivo = _conferir_campo(tipo, k, bruto.get(k))
        campos[k] = valor
        if motivo:
            motivos[k] = motivo
    lidos = [k for k, v in campos.items() if v]
    return {
        "tipo": tipo,
        "campos": campos,
        "motivos": motivos,
        "cpf_valido": True if campos.get("cpf") else None,
        "lidos": lidos,
        "aviso": None if lidos else "Não achei nenhum dado nessa foto. Tente uma foto mais nítida.",
    }


@router.post("/ler-foto")
async def ler_foto(
    file: UploadFile = File(...),
    tipo: str = Form("ficha"),
    current_user: User = Depends(get_current_user),
):
    """Lê a ficha de um paciente a partir de uma imagem. NÃO grava nada.
    tipo=ficha (padrão, o "Cadastro por foto" do PC, intocado), identity ou insurance_card (celular)."""
    if tipo != "ficha":
        if tipo not in LER_DOC_TIPOS:
            raise HTTPException(422, "Tipo de leitura inválido.")
        return await _ler_documento(file, tipo)
    if file.content_type not in LER_FOTO_TIPOS:
        raise HTTPException(422, "Formato não aceito. Envie uma imagem PNG, JPG ou WEBP.")

    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(422, "A imagem chegou vazia. Tente colar novamente.")
    if len(conteudo) > LER_FOTO_MAX_BYTES:
        raise HTTPException(422, "Imagem muito grande (máximo 6 MB). Tire um print menor.")

    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(503, "Leitura por foto não configurada (ANTHROPIC_API_KEY ausente)")

    payload = {
        "model": "claude-opus-4-8",
        "max_tokens": 1000,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": file.content_type,
                    "data": base64.b64encode(conteudo).decode(),
                }},
                {"type": "text", "text": LER_FOTO_PROMPT},
            ],
        }],
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
    except httpx.RequestError as exc:
        # Nunca logar str(exc): em erro de header inválido o httpx embute o
        # valor do header — incluindo a API key — na mensagem.
        logger.error("Erro de rede ao ler foto: %s", type(exc).__name__)
        raise HTTPException(502, "Não consegui falar com o serviço de leitura. Tente de novo.")
    finally:
        conteudo = b""  # a imagem sai da memória assim que a chamada termina

    if resp.status_code != 200:
        logger.error("Anthropic retornou %s na leitura de foto", resp.status_code)
        raise HTTPException(502, "Serviço de leitura indisponível no momento.")

    texto = "".join(
        bloco.get("text", "")
        for bloco in resp.json().get("content", [])
        if bloco.get("type") == "text"
    ).strip()

    # O modelo às vezes embrulha o JSON em ```json ... ```
    achado = re.search(r"\{.*\}", texto, re.S)
    if not achado:
        return {"campos": {}, "cpf_valido": None, "lidos": [],
                "aviso": "Não consegui ler a ficha nessa imagem. Tente um print mais nítido."}
    try:
        bruto = json.loads(achado.group(0))
    except json.JSONDecodeError:
        return {"campos": {}, "cpf_valido": None, "lidos": [],
                "aviso": "Não consegui ler a ficha nessa imagem. Tente um print mais nítido."}

    campos: dict = {}
    for k in LER_FOTO_CAMPOS:
        v = bruto.get(k)
        if isinstance(v, str):
            v = v.strip()
        campos[k] = v or None

    if campos.get("cpf"):
        campos["cpf"] = re.sub(r"\D", "", campos["cpf"])
    if campos.get("phone"):
        campos["phone"] = re.sub(r"\D", "", campos["phone"])
    if campos.get("address_zip"):
        campos["address_zip"] = re.sub(r"\D", "", campos["address_zip"])
    if campos.get("address_state"):
        campos["address_state"] = campos["address_state"].upper()[:2]
    if campos.get("name"):
        campos["name"] = campos["name"].upper()

    lidos = [k for k, v in campos.items() if v]
    return {
        "campos": campos,
        "cpf_valido": _cpf_valido(campos["cpf"]) if campos.get("cpf") else None,
        "lidos": lidos,
        "aviso": None if lidos else "Não achei nenhum dado nessa imagem. Tente um print mais nítido.",
    }


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")

    return _redact_clinical_for_secretary(PatientOut.model_validate(patient), current_user)


def _cpf_mascarado(d: str) -> str:
    return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}" if len(d) == 11 else d


def _recusar_cpf_de_outro(db: Session, patient: Patient, cpf_novo) -> None:
    """22/11 (app do celular, revisão): CPF que MUDOU e já é de OUTRO paciente da
    mesma conta = 409 com mensagem clara (antes estourava 500 na trava do banco).
    Quem salva sem mudar o CPF não passa por aqui."""
    novo = re.sub(r"\D", "", cpf_novo or "")
    if not novo or novo == re.sub(r"\D", "", patient.cpf or ""):
        return
    org = patient.organization_id
    q = db.query(Patient.id, Patient.name).filter(
        Patient.id != patient.id,
        Patient.cpf.in_([novo, _cpf_mascarado(novo)]),
    )
    if org is None or org == 1:
        q = q.filter(or_(Patient.organization_id.is_(None), Patient.organization_id == 1))
    else:
        q = q.filter(Patient.organization_id == org)
    outro = q.first()
    if outro:
        raise HTTPException(409, f"Este CPF já é de outro paciente ({outro.name}). Confira antes de salvar.")


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    data: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    _arrumar_telefones(data)
    mudancas = data.model_dump(exclude_unset=True)
    _recusar_cpf_de_outro(db, patient, mudancas.get("cpf", None) if "cpf" in mudancas else None)
    for key, value in mudancas.items():
        setattr(patient, key, value)
    db.commit()
    db.refresh(patient)
    # Mesma redação clínica do GET: secretária não recebe o histórico de volta.
    return _redact_clinical_for_secretary(PatientOut.model_validate(patient), current_user)


@router.delete("/{patient_id}", status_code=204)
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    patient.active = False
    db.commit()


@router.post("/{patient_id}/photo")
async def upload_photo(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    file_bytes = await file.read()
    ext = os.path.splitext(file.filename)[1]
    fname = str(uuid.uuid4()) + ext
    patient.photo_url = upload_file(file_bytes, fname, folder="patients")
    db.commit()
    return {"photo_url": patient.photo_url}


@router.get("/{patient_id}/timeline")
def get_timeline(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models.documents import Prescription, ExamRequest, PhysioRequest, MedicalReport
    from models.clinical_evolution import ClinicalEvolution
    from models.patient_rx import PatientRx

    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")

    # LGPD/confidencialidade: a secretaria PRECISA da timeline p/ tarefas
    # operacionais (ver que houve consultas/receitas/exames e as datas), mas NÃO
    # pode ver conteúdo clínico (diagnóstico, medicações, exames solicitados,
    # finalidade/conteúdo de laudos). Para ela, mantemos só tipo/data/título
    # genérico; médico/admin/superadmin recebem tudo.
    is_secretary = current_user.role == "secretary"

    timeline = []

    # Evolucoes clinicas: o historico que o medico escreve em cada consulta.
    # Faltava aqui — era a causa principal da aba Historico parecer vazia.
    for ev in (
        db.query(ClinicalEvolution)
        .filter(ClinicalEvolution.patient_id == patient_id)
        .all()
    ):
        texto = (ev.content or "").strip()
        # O tipo vem marcado no inicio do texto como "[RETORNO]", "[1ª CONSULTA]"...
        rotulo = "Atendimento"
        if texto.startswith("["):
            fecha = texto.find("]")
            if 0 < fecha <= 30:
                rotulo = texto[1:fecha].capitalize()
        evento = {
            "id": ev.id,
            "type": "evolucao",
            "date": ev.entry_date.isoformat(),
            "title": rotulo,
        }
        if not is_secretary:
            corpo = texto[texto.find("]") + 1:].strip() if texto.startswith("[") else texto
            evento["summary"] = corpo[:180]
        timeline.append(evento)

    # Receitas da tela de atendimento (tabela patient_prescriptions). A tabela
    # antiga "prescriptions" continua sendo lida logo abaixo, para nao perder o
    # que foi emitido antes.
    for rx in (
        db.query(PatientRx)
        .filter(PatientRx.patient_id == patient_id)
        .all()
    ):
        titulos = {
            "simples": "Receita simples",
            "controle_especial": "Receita de controle especial",
            "especial_azul": "Receita de controle especial",
            "antimicrobiano": "Receita de antimicrobiano",
        }
        evento = {
            "id": rx.id,
            "type": "receita",
            "date": rx.date.isoformat(),
            "title": titulos.get(rx.prescription_type, "Receita médica"),
        }
        if not is_secretary:
            nomes = [m.get("name", "") for m in (rx.medications or []) if m.get("name")]
            evento["summary"] = ", ".join(nomes[:3])
        timeline.append(evento)

    for c in patient.consultations:
        event = {
            "id": c.id,
            "type": "consulta",
            "subtype": c.type,
            "date": c.date.isoformat(),
            "title": f"{'1ª Consulta' if c.type == 'primeira_consulta' else 'Retorno'}",
        }
        if not is_secretary:
            event["summary"] = c.chief_complaint or c.diagnosis or ""
            event["diagnosis"] = c.diagnosis
        timeline.append(event)

    for p in patient.prescriptions:
        event = {
            "id": p.id,
            "type": "receita",
            "date": p.date.isoformat(),
            "title": "Receita Médica",
        }
        if not is_secretary:
            meds = [m.get("name", "") for m in (p.medications or [])]
            event["summary"] = ", ".join(meds[:3])
        timeline.append(event)

    for e in patient.exam_requests:
        event = {
            "id": e.id,
            "type": "exame",
            "date": e.date.isoformat(),
            "title": "Solicitação de Exames",
        }
        if not is_secretary:
            exams = [ex.get("name", "") for ex in (e.exams or [])]
            event["summary"] = ", ".join(exams[:3])
        timeline.append(event)

    for f in patient.physio_requests:
        event = {
            "id": f.id,
            "type": "fisio",
            "date": f.date.isoformat(),
            "title": f"Fisioterapia — {f.sessions} sessões",
        }
        if not is_secretary:
            event["summary"] = f.diagnosis or ""
        timeline.append(event)

    for r in patient.medical_reports:
        event = {
            "id": r.id,
            "type": "laudo",
            "date": r.date.isoformat(),
            # o próprio título/tipo do laudo pode revelar conteúdo clínico:
            # genérico p/ secretaria.
            "title": "Laudo emitido" if is_secretary else (r.title or r.report_type),
        }
        if not is_secretary:
            event["summary"] = r.purpose or ""
        timeline.append(event)

    timeline.sort(key=lambda x: x["date"], reverse=True)
    return timeline
