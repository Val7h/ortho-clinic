from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
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
        q = q.filter(or_(Patient.name.ilike(term), Patient.cpf.ilike(term), Patient.phone.ilike(term)))
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
    _exigir_cadastro_completo(data, current_user)
    if data.cpf:
        existing = db.query(Patient).filter(
            Patient.cpf == data.cpf,
            Patient.organization_id == current_user.organization_id,
        ).first()
        if existing:
            raise HTTPException(400, "CPF já cadastrado")

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


@router.post("/ler-foto")
async def ler_foto(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Lê a ficha de um paciente a partir de uma imagem. NÃO grava nada."""
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
    for key, value in data.model_dump(exclude_unset=True).items():
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
