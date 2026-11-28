"""Alergias citadas na consulta x campo Alergias da ficha (27/11/2026, Valth).

Caso que motivou: alergia escrita na consulta e o campo da ficha vazio (26/11).

Regra (revisao independente 28/11): o resumo do Escriba/bot NUNCA grava na ficha sozinho.
A extracao so produz SUGESTOES, usadas pela trava do Finalizar:
  - extrair(texto)         -> alergias AFIRMADAS no texto. CONSERVADORA: perder uma alergia e muito
                              melhor do que travar o Finalizar com lixo.
  - faltando(texto, ficha) -> as extraidas que NAO estao no campo da ficha (palavra inteira, nome todo).
  - mesclar(ficha, novas)  -> campo com as novas acrescentadas, sem apagar nem repetir.
  - conferir_finalizacao   -> 409 ALERGIA_PENDENTE com as sugestoes; 'adicionar' grava SO esses itens;
                              'ignorar' fica guardado por paciente + item (AlergiaIgnorada) e nao pergunta mais.
"""
from __future__ import annotations

import re
import unicodedata

# Gatilho: alergia/alergias (substantivo) ou alergico/alergica (adjetivo), aceitando o erro "alegi...".
# Tambem "intolerancia a" e "reacao (alergica|adversa) a".
_SUBST = r"(?:alergi|alegi)(?:as|a)\b"
_ADJ = r"(?:al[eé]rgic|alergic|alegic)(?:os|as|o|a)\b"
_CONECTOR = r"(?:\s*:\s*|\s+-\s+|\s+(?:a|ao|aos|à|às|as|de|do|da|por)\b\s*)"
_MED = r"(?:\s+(?:medicamentos[ao]s?|alimentar(?:es)?|de\s+contato))?"
_GATILHO = re.compile(
    rf"\b(?:(?P<subst>{_SUBST}){_MED}(?P<csub>{_CONECTOR})?"
    rf"|(?P<adj>{_ADJ}){_MED}(?P<cadj>{_CONECTOR})"
    rf"|(?P<outro>rea[cç][aã]o(?:\s+(?:al[eé]rgica|adversa))?)(?P<cout>\s+(?:a|ao|aos|à|às)\b\s*))",
    re.I,
)
# o adjetivo sem conector ("rinite alergica controlada") nao e alergia a uma substancia: o regex exige conector.
# primeira palavra que descreve a doenca, nao a substancia ("alergia respiratoria", "alergia controlada")
_PRIMEIRA_RUIM = {"respiratoria", "respiratorias", "sazonal", "cutanea", "ocular", "nasal", "cronica", "leve",
                  "grave", "pele", "controlada", "controladas", "rinite", "dermatite", "asma", "conhecida",
                  "conhecidas", "previa", "previas", "importante", "medicamentosa", "medicamentosas"}

# negacao ANTES do gatilho, na mesma frase/oracao (nao atravessa . ; , nem quebra de linha)
_NEGA_ANTES = re.compile(
    r"\b(nega|negou|nenhuma|nenhum|sem|nao|não|ausencia|ausência|desconhece|nkda|nada)\b[^.;,\n]{0,25}$",
    re.I,
)
# negacao LOGO DEPOIS do gatilho: "Alergias: nega", "Alergia: NKDA", "alergia nega", "Alergias: sem alergias"
_NEGA_DEPOIS = re.compile(
    r"^\W*(nega|negou|negativ\w*|nenhum\w*|nao|não|sem|nkda|nda|ndn|desconhec\w*|nada|ausente\w*|inexistente\w*|n/?d)\b",
    re.I,
)
# negacao em qualquer ponto do trecho: "Alergia a dipirona negada"
_NEGADO_NO_TRECHO = re.compile(r"\b(negad[oa]s?|descartad[oa]s?|afastad[oa]s?|suspeit\w*|investig\w*)\b", re.I)
# historia familiar e suspeita/investigacao antes do gatilho, na mesma frase
_FAMILIA = re.compile(
    r"\b(mae|pai|pais|irmao|irma|irmaos|irmas|filho|filha|filhos|avo|avos|tio|tia|primo|prima|"
    r"esposa|esposo|marido|familiar|familiares|familia|hf|antecedentes? familiar\w*)\b",
    re.I,
)
_SUSPEITA = re.compile(
    r"\b(suspeita|suspeito|investigar|investigacao|investiga|pesquisar|pesquisa|possivel|provavel|"
    r"descartar|afastar|teste|testes|exame|hipotese|duvida)\b",
    re.I,
)
_FIM = re.compile(r"[.;\n?!()\[\]|]")
# corte do trecho extraido: virgula, " - ", como, apos, nega e as frases de relato
_CORTE = re.compile(
    r"(,|\s+-\s+|\s+\b(?:como|apos|após|nega|negou|e\s+nega|refere|relata|informa|diz|desde|ha|há|faz|tem|teve|"
    r"com|que|quando|mas|porem|porém|no|na|nos|nas|em|ja|já|durante|ao\s+uso)\b).*$",
    re.I | re.S,
)
# palavras que nao sao a substancia
_VAZIO = {"", "medicamento", "medicamentos", "medicacao", "medicacoes", "remedio", "remedios",
          "conhecida", "conhecidas", "referida", "referidas", "a", "ao", "de", "nenhuma", "nada",
          "alergia", "alergias", "alergico", "alergica", "outras", "outros", "varios", "varias",
          "algum", "alguma", "alguns", "algumas", "tratamento", "fisioterapia", "conduta", "dor",
          "frio", "calor", "palpacao", "estimulo", "infiltracao", "procedimento", "uso"}
_SEPARA = re.compile(r"\s*/\s*|\s+e\s+|\s+ou\s+", re.I)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def _inicio_da_frase(texto: str, pos: int, para_em: str) -> str:
    """Trecho entre o ultimo separador (para_em) antes de pos e pos."""
    ini = max((texto.rfind(c, 0, pos) for c in para_em), default=-1)
    return texto[ini + 1:pos]


def extrair(texto: str) -> list[str]:
    """Alergias AFIRMADAS no texto, em MAIUSCULAS, na ordem em que aparecem, sem repetir."""
    texto = texto or ""
    achadas: list[str] = []
    vistos: set[str] = set()
    for m in _GATILHO.finditer(texto):
        antes_oracao = _inicio_da_frase(texto, m.start(), ".;,\n")[-40:]
        if _NEGA_ANTES.search(antes_oracao):
            continue
        antes_frase = _norm(_inicio_da_frase(texto, m.start(), ".;\n"))
        if _FAMILIA.search(antes_frase) or _SUSPEITA.search(antes_frase):
            continue
        resto = texto[m.end():]
        if _NEGA_DEPOIS.search(resto):
            continue
        fim = _FIM.search(resto)
        trecho = resto[:fim.start()] if fim else resto
        if fim and resto[fim.start()] == "?":
            continue  # pergunta, nao afirmacao
        if _NEGADO_NO_TRECHO.search(_norm(trecho)):
            continue
        segmentos = trecho[:160].split(",")
        primeiro = segmentos[0]
        cortado = _CORTE.sub("", primeiro)
        parou = len(cortado) < len(primeiro)   # cortou em " - ", nega, refere...: a lista acaba aqui
        primeiro = cortado.strip(" ,:-*\"'")
        if not primeiro or (_norm(primeiro).split() or [""])[0] in _PRIMEIRA_RUIM:
            continue
        nomes: list[str] = []
        for parte in _SEPARA.split(primeiro):
            nome = parte.strip(" ,:-*\"'")
            k = _norm(nome)
            if k in _VAZIO or len(k) < 3 or len(nome.split()) > 4:
                continue
            if _NEGA_DEPOIS.search(nome):
                continue
            nomes.append(nome)
        # 28/11 (revisao): lista separada por virgula. Cada item depois da virgula passa pelo portao
        # (_item_da_lista) e a lista PARA no primeiro que falhar: "penicilina, controlada" -> so PENICILINA.
        if nomes and not parou:
            nomes += _itens_depois_da_virgula(segmentos[1:])
        for nome in nomes:
            k = _norm(nome)
            if k not in vistos:
                vistos.add(k)
                achadas.append(nome.upper())
    return achadas


# ── lista separada por virgula: portao de cada item ────────────────────────────
# item que comeca com uma destas palavras encerra a lista
_PARA_LISTA = {"nega", "negou", "refere", "relata", "informa", "diz", "desde", "com", "que", "quando", "leve",
               "grave", "previa", "previas", "outras", "outros", "outra", "outro", "ha", "por", "em", "no", "na",
               "mas", "porem", "sem", "nao", "tem", "teve", "faz", "apos", "como", "durante", "ja", "e", "ou",
               "evitar", "orientado", "orientada", "uso", "usa", "fez", "cursa", "evoluiu", "evolui"}
# o que nao e remedio mas e alergia comum (e classes que a tabela da ANVISA nao traz como principio)
_NAO_REMEDIO = {"latex", "iodo", "contraste", "contraste iodado", "esparadrapo", "frutos do mar", "camarao",
                "picada de inseto", "abelha", "niquel",
                "penicilina", "penicilinas", "sulfa", "aine", "aines", "anti-inflamatorio", "anti-inflamatorios",
                "antiinflamatorio", "antiinflamatorios", "corticoide", "corticoides", "cefalosporina",
                "cefalosporinas", "antibiotico", "antibioticos"}
_LEXICO = {"carregado": False, "nomes": set()}


def _lexico() -> set[str]:
    """Marcas e principios ativos da tabela da ANVISA (data/medicamentos_anvisa.json, a mesma do Escriba).
    Sem a tabela, o conjunto fica vazio: os itens depois da virgula so passam pela lista curta."""
    if not _LEXICO["carregado"]:
        _LEXICO["carregado"] = True
        try:
            import json
            from pathlib import Path
            arq = Path(__file__).resolve().parent.parent / "data" / "medicamentos_anvisa.json"
            marcas = json.loads(arq.read_text(encoding="utf-8")).get("marcas") or {}
            nomes = set(marcas)
            for v in marcas.values():
                for c in ([v] if isinstance(v, str) else list(v)):
                    nomes.update(x.strip() for x in str(c).split("+") if x.strip())
            _LEXICO["nomes"] = {_norm(n) for n in nomes}
        except Exception:
            _LEXICO["nomes"] = set()
    return _LEXICO["nomes"]


def _item_da_lista(nome: str) -> bool:
    k = _norm(nome)
    pal = k.split()
    if not pal or pal[0] in _PARA_LISTA or len(pal) > 3 or len(k) < 3:
        return False
    if k in _NAO_REMEDIO or k in _lexico():
        return True
    # "AAS 100 mg", "Plasil gotas": a primeira palavra e o remedio
    return len(pal[0]) >= 4 and pal[0] in _lexico()


def _itens_depois_da_virgula(segmentos: list[str]) -> list[str]:
    nomes: list[str] = []
    for seg in segmentos:
        bruto = seg.strip(" :-*\"'")
        if not bruto or (_norm(bruto).split() or [""])[0] in _PARA_LISTA:
            break
        cortado = _CORTE.sub("", bruto)
        parou = len(cortado) < len(bruto)
        for parte in _SEPARA.split(cortado.strip(" :-*\"'")):
            nome = parte.strip(" :-*\"'")
            if not _item_da_lista(nome):
                return nomes
            nomes.append(nome)
        if parou:
            break
    return nomes


def chave(nome: str) -> str:
    """Nome normalizado (sem acento, minusculo, espacos simples): chave da ficha e do 'ignorar'."""
    return _norm(nome)[:200]


def ja_na_ficha(nome: str, ficha: str) -> bool:
    """O nome TODO, como palavra inteira, no campo da ficha ('sulfa' nao casa com 'sulfato ferroso')."""
    k = _norm(nome)
    if not k:
        return True
    return re.search(r"(?<![a-z0-9])" + re.escape(k) + r"(?![a-z0-9])", _norm(ficha)) is not None


def faltando(texto: str, ficha: str) -> list[str]:
    return [a for a in extrair(texto) if not ja_na_ficha(a, ficha or "")]


# ficha que so diz "nao tem alergia": ao acrescentar uma alergia confirmada, o texto antigo sai
_FICHA_SO_NEGA = re.compile(
    r"\W*(?:nega\w*(?:\s+alergias?(?:\s+medicamentos\w*)?)?|nenhuma(?:\s+conhecida)?|sem\s+alergias?(?:\s+(?:conhecidas?|medicamentosas?))?"
    r"|nkda|nda|ndn|nao|desconhece|nada\s+consta)\W*",
    re.I,
)


def mesclar(ficha: str | None, novas: list[str]) -> str:
    atual = (ficha or "").strip()
    if novas and _FICHA_SO_NEGA.fullmatch(_norm(atual)):
        atual = ""
    vistos, limpas = set(), []
    for a in novas:
        k = _norm(a)
        if not k or k in vistos or ja_na_ficha(a, atual):
            continue
        vistos.add(k)
        limpas.append(a)
    if not limpas:
        return atual
    return "; ".join([x for x in [atual] + limpas if x])


def _linhas_json(valor) -> str:
    import json
    try:
        return "\n".join(str(x) for x in (json.loads(valor or "[]") or []))
    except Exception:
        return ""


def texto_do_dia(db, patient_id: int, dia) -> str:
    """Tudo o que foi escrito do paciente no dia: anamnese(s) + resumo do Escriba (auto e sessao)."""
    from models.clinical_evolution import ClinicalEvolution, EscribaResumo
    partes = [e.content or "" for e in db.query(ClinicalEvolution).filter(
        ClinicalEvolution.patient_id == patient_id, ClinicalEvolution.entry_date == dia).all()]
    for r in db.query(EscribaResumo).filter(
            EscribaResumo.patient_id == patient_id, EscribaResumo.entry_date == dia).all():
        partes += [_linhas_json(r.linhas), _linhas_json(r.linhas_sessao)]
    return "\n".join(p for p in partes if p)


def ignoradas(db, patient_id: int) -> set[str]:
    from models.clinical_evolution import AlergiaIgnorada
    return {r.item for r in db.query(AlergiaIgnorada).filter(AlergiaIgnorada.patient_id == patient_id).all()}


def sugestoes(db, patient, dia) -> list[str]:
    """Alergias citadas no dia, fora da ficha e que o medico ainda nao mandou ignorar."""
    ficha = patient.allergies or patient.alergias or ""
    ign = ignoradas(db, patient.id)
    return [a for a in faltando(texto_do_dia(db, patient.id, dia), ficha) if chave(a) not in ign]


def conferir_finalizacao(db, patient, dia, acao: str | None, itens: list[str] | None = None,
                         user_id: int | None = None) -> list[str]:
    """TRAVA (27/11/2026): alergia citada no dia e ausente da ficha bloqueia o Finalizar.
    acao=None        -> HTTPException 409 codigo ALERGIA_PENDENTE com as sugestoes (a tela pergunta)
    acao='adicionar' -> grava na ficha SO as sugestoes (e, se a tela mandou 'itens', so as que ela mostrou)
    acao='ignorar'   -> guarda paciente + item; o mesmo item nao e perguntado de novo para esse paciente
    Devolve os itens tratados (vazio = nada a fazer). Nao faz commit."""
    from fastapi import HTTPException
    pend = sugestoes(db, patient, dia)
    if not pend:
        return []
    if acao in ("adicionar", "ignorar") and itens is not None:
        mostrados = {chave(i) for i in itens if isinstance(i, str)}
        alvo = [a for a in pend if chave(a) in mostrados]
        novos = [a for a in pend if chave(a) not in mostrados]
        if novos:
            # apareceu alergia nova depois da pergunta: pergunta de novo (nada gravado)
            pend = novos
            acao = None
        else:
            pend = alvo
    if acao == "adicionar":
        patient.allergies = mesclar(patient.allergies or patient.alergias or "", pend)
        return pend
    if acao == "ignorar":
        from models.clinical_evolution import AlergiaIgnorada
        ja = ignoradas(db, patient.id)
        for a in pend:
            k = chave(a)
            if k in ja:
                continue
            ja.add(k)
            db.add(AlergiaIgnorada(patient_id=patient.id, organization_id=patient.organization_id or 1,
                                   item=k, user_id=user_id))
        return pend
    raise HTTPException(409, detail={
        "codigo": "ALERGIA_PENDENTE",
        "alergias": pend,
        "msg": "Alergia citada na consulta e ausente da ficha: " + ", ".join(pend)
               + ". Adicione à ficha ou confirme que não é alergia antes de finalizar.",
    })
