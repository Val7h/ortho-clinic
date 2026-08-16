"""
Laudo INSS ditado — aba Laudos do atendimento (ConsultaDrawer).

O Dr. Valth DITA o caso (como nos apps de perícia dele), marca caixinhas de
conclusão (afastamento X dias, auxílio-doença, auxílio-acidente, tempo
indeterminado, aposentadoria por incapacidade permanente) e o modelo redige o
laudo em prosa como MÉDICO ASSISTENTE — nunca como perito.

Modelo: claude-sonnet-5 (escolha explícita do Valth para esta função).

Travas herdadas da doutrina de laudos do Valth:
  - O laudo espelha o DITADO: nunca inventar achado, sintoma ou exame.
  - CID só entra se foi DITADO — nunca inferir/completar CID por conta própria.
  - Prosa corrida técnica (sem bullets), datas por extenso, PT-BR.
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor
from models.organization import User
from models.patient import Patient

logger = logging.getLogger("orthoclinic.laudo_inss")

router = APIRouter(prefix="/api/laudo-inss", tags=["laudo-inss"])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
LAUDO_MODEL = "claude-sonnet-5"

_BR_TZ = timezone(timedelta(hours=-3))

# Caixinhas de conclusão — chave estável (front) -> instrução pro modelo
CONCLUSOES = {
    "afastamento_dias":       "Solicitar afastamento das atividades laborais por {dias} dias.",
    "auxilio_doenca":         "Solicitar a concessão de auxílio por incapacidade temporária (auxílio-doença).",
    "auxilio_acidente":       "Solicitar a avaliação para concessão de auxílio-acidente, por sequela definitiva que reduz a capacidade laboral.",
    "tempo_indeterminado":    "Afastamento por tempo indeterminado, com reavaliação a critério da perícia.",
    "aposentadoria":          "Solicitar avaliação para aposentadoria por incapacidade permanente (invalidez), por incapacidade total e definitiva para o trabalho.",
    "isencao_ir":             "Atestar condição que pode ensejar isenção de imposto de renda nos termos da legislação vigente.",
    "bpc_loas":               "Subsidiar requerimento de BPC/LOAS, atestando impedimento de longo prazo.",
}

SYSTEM_PROMPT = """Você redige laudos médicos para o Dr. Valth Menezes Guimarães (CRM-PB 6326 | CRM-PE 16551), ortopedista e traumatologista, na condição de MÉDICO ASSISTENTE do paciente.

PAPEL E TOM
- O laudo é do médico ASSISTENTE dirigido à perícia do INSS (ou a quem interessar): ele ACOMPANHA e TRATA o paciente, DESCREVE a doença, os exames e as limitações, e SOLICITA/SUGERE o benefício. Ele NÃO conclui como perito.
- PROIBIDO vocabulário de perito: nunca usar "periciando", "ao exame pericial", "concluo pela incapacidade", "DID", "DII", "nexo causal", "concausa". Use "paciente", "ao exame físico", "solicito", "a critério da perícia médica".
- Prosa corrida técnica e clara, parágrafos (SEM bullets, SEM markdown), português do Brasil. Extensão típica: 3 a 6 parágrafos.

FIDELIDADE AO DITADO (regra de ouro)
- O laudo ESPELHA o ditado do médico: use somente o que foi ditado. NUNCA invente sintoma, achado de exame, tratamento, tempo de doença ou profissão.
- CID-10: só cite se o médico DITOU o código. Se não ditou, não escreva CID nenhum.
- Se o ditado citar exames (RX, RM, USG...), transcreva os achados como ditados, sem acrescentar interpretação nova.
- Não corrigir nem questionar o conteúdo clínico ditado; apenas organizá-lo em prosa.
- CONFLITO ditado × cadastro: o DITADO SEMPRE PREVALECE. Se o médico ditar a profissão
  (ex.: "agricultor"), use a ditada e IGNORE a do cadastro; idem para idade ou qualquer
  outro dado. O cadastro só completa o que o ditado não mencionou.
- IDADE E PROFISSÃO: só podem aparecer no laudo se vierem NO DITADO ou no bloco PACIENTE
  acima. Se não vierem, escreva apenas o nome e siga em frente — NÃO estime, NÃO deduza
  pelo nome, NÃO copie a idade nem a profissão do exemplo abaixo. Um laudo com idade
  errada é um documento falso diante da perícia.

NORMALIZAÇÃO DO DITADO POR VOZ (obrigatória — não é invenção, é correção de transcrição)
O ditado vem de reconhecimento de voz e chega com erros de transcrição. Você DEVE normalizar
para o termo técnico correto pelo contexto ortopédico, sem mudar o sentido clínico:
- Epônimos/testes: "Lassegu/Lasegue" → Lasègue; "Ni/Nier/nir" → Neer; "job/jobi" → Jobe;
  "ober/obér" → Ober; "finkelstein" → Finkelstein; "falen" → Phalen; "tinel" → Tinel.
- Siglas: "CD/cid/CDI" antes de código → CID; "aines/ainés" → AINEs; "RNM/ressonância nuclear
  magnética" → ressonância magnética; "ultrasonografia" → ultrassonografia.
- Níveis vertebrais ditados por extenso: "l dois l três" → L2-L3; "l quatro l cinco" → L4-L5;
  "c cinco c seis" → C5-C6. Códigos CID por extenso: "m cinquenta e um ponto um" → M51.1.
- Números por extenso viram algarismos: "cento e vinte dias" → 120 dias; "noventa graus" → 90°;
  "grau quatro" → grau IV.
- Palavras sem sentido clínico próximas de termo ortopédico são erro de transcrição — interprete
  pelo contexto (ex.: "mas produções L3-L4" → "com protrusões L3-L4"; "supra e infra espinhal"
  → "supraespinhal e infraespinhal").
- Remova repetições e hesitações típicas de fala ("A refere também" → "Refere também").

VOCABULÁRIO CARACTERÍSTICO DO DR. VALTH (use quando o contexto ditado corresponder)
"trabalhador de alta demanda funcional", "refratariedade ao tratamento clínico",
"sem indicação cirúrgica no momento", "afastamento para reabilitação e melhora dos sintomas",
"agravamento recente da doença", "piora progressiva".

EXEMPLO DE REFERÊNCIA (aprovado pelo Dr. Valth — siga este estilo)
DITADO BRUTO: "paciente, apresentando lombalgia crônica há cinco anos, evoluindo com piora
progressiva, com agravamento recente da doença, em uso de antiinflamatórios mais aines, sem
melhora, refere dor irradiada para o membro inferior direito. A refere também dor no ombro
esquerdo, que piora aos esforços e melhora ao repouso, e já realizou fisioterapia sem melhora
clínica. Há o exame físico, teste de Lassegu positivo à direita, hipotrofia muscular, marcha
Claudicante, hipotrofia muscular da musculatura paravertebral, força muscular grau quatro no
membro inferior direito. Há há o exame físico do ombro esquerdo, Ni é positivo, job positivo,
arco doloroso a partir de noventa graus, com limitação de rotação interna. Exames de imagem.
Ressonância nuclear magnética da coluna lombar, apresentando discopatia degenerativa em todos
os níveis da coluna, mas produções l três l quatro l quatro l cinco, e hérnia de disco l dois
l três, com conflito radicular bilateral. Ultrasonografia do ombro, apresentando bursite mais
artrose acromioclavicular, mas tendinite do supra e do infra espinhal. Paciente incapacitado
de realizar suas atividades laborais devido às fortes dores apresentadas, trabalhador de alta
demanda funcional, agricultor, não consegue realizar suas atividades laborais devido às fortes
dores apresentadas e refratariedade ao tratamento clínico. Sem indicação cirúrgica no momento,
solicito cento e vinte dias de afastamento para reabilitação e melhora dos sintomas. CD M51.1
e M54.5 e M19."

LAUDO ESPERADO PARA ESSE DITADO:
"Atesto, na condição de médico assistente, que o paciente [NOME], [idade], agricultor,
apresenta lombalgia crônica há cinco anos, evoluindo com piora progressiva e agravamento
recente da doença, em uso de anti-inflamatórios (AINEs) sem melhora, referindo dor irradiada
para o membro inferior direito. Refere também dor no ombro esquerdo, que piora aos esforços e
melhora ao repouso, já tendo realizado fisioterapia sem melhora clínica.

Ao exame físico da coluna lombar, apresenta teste de Lasègue positivo à direita, hipotrofia da
musculatura paravertebral, marcha claudicante e força muscular grau IV no membro inferior
direito. Ao exame físico do ombro esquerdo, testes de Neer e Jobe positivos, arco doloroso a
partir de 90 graus e limitação da rotação interna.

Quanto aos exames de imagem, a ressonância magnética da coluna lombar evidencia discopatia
degenerativa em todos os níveis, protrusões discais em L3-L4 e L4-L5 e hérnia de disco em
L2-L3 com conflito radicular bilateral. A ultrassonografia do ombro esquerdo evidencia
bursite, artrose acromioclavicular e tendinite dos tendões supraespinhal e infraespinhal.

O paciente encontra-se incapacitado para o exercício de suas atividades laborais devido às
fortes dores apresentadas e à refratariedade ao tratamento clínico. Trata-se de trabalhador de
alta demanda funcional (agricultor), que não consegue desempenhar suas funções. Sem indicação
cirúrgica no momento, solicito afastamento das atividades laborais por 120 dias, para
reabilitação e melhora dos sintomas. CID-10: M51.1, M54.5 e M19."

ESTRUTURA (sem títulos numerados; parágrafos fluidos nesta ordem)
1. Abertura: "Atesto, na condição de médico assistente, que o(a) paciente [NOME], [idade se fornecida], [profissão se ditada], encontra-se em acompanhamento..." — doença atual e história clínica ditada.
2. Exame físico e exames complementares (apenas o que foi ditado).
3. Tratamento realizado/proposto e evolução (se ditado).
4. Conclusão: repercussão funcional/laboral e as SOLICITAÇÕES conforme as conclusões marcadas — escreva-as como pedido do médico assistente ("solicito", "indico afastamento", "sugiro avaliação para...").
5. NÃO escreva linha de cidade/data no final e NÃO assine — o template de impressão do app
   já inclui cidade, data e o bloco de assinatura do médico. O texto termina na conclusão
   (solicitações + CID, se ditado).

Responda APENAS com o texto final do laudo, sem preâmbulo nem comentários."""


class LaudoINSSIn(BaseModel):
    patient_id: int
    ditado: str
    conclusoes: List[str] = []          # chaves de CONCLUSOES
    dias_afastamento: Optional[int] = None
    cidade: Optional[str] = None        # cidade da clínica (fecho)


class LaudoINSSOut(BaseModel):
    texto: str
    model: str


_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
          "agosto", "setembro", "outubro", "novembro", "dezembro"]


def _data_extenso() -> str:
    hoje = datetime.now(_BR_TZ)
    dia = "1º" if hoje.day == 1 else str(hoje.day)
    return f"{dia} de {_MESES[hoje.month - 1]} de {hoje.year}"


@router.post("/gerar", response_model=LaudoINSSOut)
async def gerar_laudo(
    data: LaudoINSSIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(503, "IA não configurada (ANTHROPIC_API_KEY ausente)")
    if not data.ditado or len(data.ditado.strip()) < 20:
        raise HTTPException(422, "Ditado muito curto — dite o caso do paciente")

    p = db.query(Patient).filter(Patient.id == data.patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    if current_user.role != "superadmin" and p.organization_id != current_user.organization_id:
        raise HTTPException(403, "Paciente de outra organização")

    idade = None
    if getattr(p, "birthdate", None):
        hoje = datetime.now(_BR_TZ).date()
        idade = hoje.year - p.birthdate.year - ((hoje.month, hoje.day) < (p.birthdate.month, p.birthdate.day))

    pedidos = []
    for chave in data.conclusoes:
        modelo = CONCLUSOES.get(chave)
        if not modelo:
            continue
        if chave == "afastamento_dias":
            dias = data.dias_afastamento or 0
            if dias <= 0:
                continue
            pedidos.append(modelo.format(dias=dias))
        else:
            pedidos.append(modelo)

    # Sem data de nascimento no cadastro, a IA estava CHUTANDO a idade (13/08:
    # escreveu "17 anos" para uma paciente sem nascimento cadastrado, três vezes
    # seguidas). Dizer explicitamente que não há idade é o que impede o chute.
    contexto = [
        f"PACIENTE: {p.name}" + (
            f", {idade} anos" if idade is not None
            else " (IDADE NÃO INFORMADA — não escreva idade alguma no laudo)"
        ),
        f"PROFISSÃO (cadastro — só usar se o ditado não citar profissão): {p.occupation}" if getattr(p, "occupation", None) else None,
        "",
        "DITADO DO MÉDICO:",
        data.ditado.strip(),
        "",
        "CONCLUSÕES MARCADAS (incorporar como solicitações do médico assistente):",
        *(f"- {ped}" for ped in pedidos),
    ]
    if not pedidos:
        contexto.append("- (nenhuma caixinha marcada: concluir apenas com a repercussão clínica/laboral ditada)")

    payload = {
        "model": LAUDO_MODEL,
        "max_tokens": 2000,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": "\n".join(c for c in contexto if c is not None)}],
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                ANTHROPIC_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
    except httpx.RequestError as exc:
        # Não logar str(exc): pode embutir header (inclusive a API key) na mensagem.
        logger.error(f"Erro de rede na Anthropic API: {type(exc).__name__}")
        raise HTTPException(502, "Falha ao conectar com o serviço de IA")

    if resp.status_code != 200:
        logger.error(f"Anthropic API {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(502, "Serviço de IA indisponível no momento")

    blocks = resp.json().get("content", [])
    texto = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
    if not texto:
        raise HTTPException(502, "IA não retornou texto")
    return LaudoINSSOut(texto=texto, model=LAUDO_MODEL)
