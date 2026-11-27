"""REGUA UNICA: "este documento ja existe hoje?" (etapa E3, plano aprovado pelo Valth em 23/11/2026).

27/11/2026 (emissor unico, P2): copia FIEL de escriba-clinica/ao_vivo/regua.py (commit 813ff23) portada para o
servidor, mais as CHAVES do emissor (fim do arquivo). Quem calcula a chave e o SERVIDOR; o PC so manda o texto cru.
Mudou a regua do PC? Mude aqui tambem (os testes de tests/test_regua_portada.py sao os mesmos 27 do PC).

Tres maos criam documento (a sessao Claude pelo consulta.py/rapido.py, o medico na tela e a Escriba pelo
ortho_documento.py) e cada uma tinha uma regua. Em 23/11 "TOMOGRAFIA DA COLUNA LOMBAR" nao bateu com "TOMOGRAFIA
COMPUTADORIZADA DA COLUNA LOMBOSSACRA" e saiu pedido duplicado; "leva", "levo" e "levofloxacino" viraram 3 perguntas.

Exame = mesma CLASSE (RNM, TC, USG, RX, densitometria, ENMG, laboratorio, fisioterapia, procedimento...) + mesma REGIAO
(lombar = lombossacra = L1-S1; toracica = dorsal) + LADO compativel (joelhos/JJ/bilateral = os dois lados).
RNM e TC da mesma regiao NAO sao o mesmo documento (classes diferentes).
Remedio = mesmo PRINCIPIO ATIVO, pela tabela da ANVISA (config/medicamentos_anvisa.json, a mesma do site). Marca so
vira principio pela tabela, nunca deduzida. Nome que a tabela nao conhece fica como esta (1a palavra), sem adivinhar.

Sem dependencia: so biblioteca padrao. Importavel pelo Python da Escriba e pelo das ferramentas (sys.path).
"""
import datetime
import json
import re
import unicodedata
from pathlib import Path

ANVISA = Path(__file__).resolve().parent.parent / "data" / "medicamentos_anvisa.json"  # a mesma tabela do PC
FUSO = datetime.timezone(datetime.timedelta(hours=-3))  # Brasil sem horario de verao


def norm(t) -> str:
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(c) != "Mn").lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


# ---------------------------------------------------------------- exames ----------------------------------------------
# mesma ordem e regra do consulta.py (CLASSES), com o texto ja sem acento e em minusculas
CLASSES = [
    ("Ressonância", r"resson|\brnm\b|\brm\b|\brmn\b"),
    ("Tomografia", r"tomograf|\btc\b|\btac\b"),
    ("Ultrassonografia", r"ultrass|ultrasom|\busg\b|\bus\b|doppler"),
    ("Radiografia", r"radiograf|\brx\b|raio ?x"),
    ("Densitometria", r"densitometr|\bdxa\b|\bdmo\b"),
    ("Eletroneuromiografia", r"eletroneuro|\benmg\b"),
    ("Cintilografia", r"cintilograf"),
    ("Cardiologia", r"eletrocardio|\becg\b|risco cir|cardiol|ecocardio"),
    ("Procedimento", r"infiltra|viscossupl|bloqueio|acido hialur|reviscon|synolis|suprahyal|synvisc|durolane|triancil|"
                     r"triancinol|diprospan|betametas|proloterap|artrocent"),
    ("Fisioterapia", r"fisioterap|\brpg\b|hidroterap|acupunt"),
]
SUBTIPO = {  # dentro da classe, o que faz ser OUTRO documento
    "Procedimento": [("visco", r"viscossupl|hialur|reviscon|synolis|suprahyal|synvisc|durolane"), ("bloqueio", r"bloqueio"),
                     ("infiltracao", r"infiltra|triancil|triancinol|diprospan|betametas"), ("prolo", r"proloterap"),
                     ("artrocentese", r"artrocent")],
    "Cardiologia": [("risco", r"risco cir|cardiol"), ("eco", r"ecocardio"), ("ecg", r"eletrocardio|\becg\b")],
}
# (regiao, regex no texto normalizado). Ordem importa: sacroiliaca antes de lombar; especifico antes de generico.
REGIOES = [
    ("sacroiliaca", r"sacro ?iliac"),  # revisao E3: regiao propria, nao e lombar
    ("bacia", r"\bbacia\b|\bpelve\b|\bpelvis\b|\bpelvic"),
    ("coluna total", r"coluna (?:total|inteira|panoramic)|panoramica da coluna|escanometria"),
    ("coluna lombar", r"lomb|\bsacr(?!o ?iliac)|\bl[1-5]\b|\bs1\b"),
    ("coluna cervical", r"cervic"),
    ("coluna toracica", r"torac|\bdorsal"),
    ("coluna", r"\bcoluna\b"),
    ("membros inferiores", r"\bmmii\b|membros? inferior"),
    ("membros superiores", r"\bmmss\b|membros? superior"),
    ("joelho", r"joelh|patel|rotula|menisc|\bj[jde]\b"),
    ("ombro", r"\bombros?\b|clavic|escapul|manguito"),
    ("cotovelo", r"cotovel|olecran"),
    ("punho", r"\bpunhos?\b|escafoid|\bcarpo\b"),
    ("mao", r"\bmaos?\b|quirodact|polegar|metacarp"),
    ("tornozelo", r"tornozel|maleol"),
    ("pe", r"\bpes?\b|halux|calcan|metatars|antepe|retrope|artelh|\btarso\b"),
    ("quadril", r"quadri|coxofemor"),
    ("coxa", r"\bcoxas?\b|\bfemur"),
    ("perna", r"\bpernas?\b|\btibias?\b|fibula"),
    ("antebraco", r"antebrac"),
    ("braco", r"\bbracos?\b|\bumero"),
    ("torax", r"\btorax\b"),
    ("abdome", r"abdom"),
    ("cranio", r"cranio|encefal"),
]
_OS_DOIS = (r"\b(?:bilateral|ambos|ambas|em cada|jj|joelhos|ombros|quadris|punhos|tornozelos|cotovelos|maos|pes|pernas|"
            r"coxas|bracos|antebracos)\b")
_LAB_FORA = {"exame", "exames", "dosagem", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "sangue", "serico",
             "serica", "solicito", "completo", "completa", "total"}
_NAO_ITEM = re.compile(r"^(solicito|hd|cid|obs|indicacao|justificativa|conclusao|solicitado|paciente|convenio)\b")


def classe(item) -> str:
    t = norm(item)
    for nome, rx in CLASSES:
        if re.search(rx, t):
            return nome
    return "Laboratório"


def regioes(item) -> frozenset:
    t = norm(item)
    out = {r for r, rx in REGIOES if re.search(rx, t)}
    if "coluna total" in out:  # RX da coluna total e outro exame (nao e o da lombar)
        out -= {"coluna", "coluna lombar", "coluna cervical", "coluna toracica"}
    if "coluna" in out and out & {"coluna lombar", "coluna cervical", "coluna toracica"}:
        out.discard("coluna")
    if "coluna toracica" in out and "coluna" not in t and out - {"coluna toracica"}:
        out.discard("coluna toracica")  # "dorsal do pe" nao e coluna
    return frozenset(out)


def lados(item) -> frozenset:
    """{'D','E'}; joelhos/JJ/bilateral/ambos = os dois. Vazio = lado nao dito (casa com qualquer lado)."""
    t = norm(item)
    out = set()
    if re.search(_OS_DOIS, t):
        out |= {"D", "E"}
    if re.search(r"\bdireit|\bjd\b", t):
        out.add("D")
    if re.search(r"\besquerd|\bje\b", t):
        out.add("E")
    # revisao E3: "D"/"DIR" e "E"/"ESQ" sozinhos tambem sao lado ("RX OMBRO D"). "E" no meio da frase e conjuncao:
    # so vale no fim do item ou antes de "sem/com contraste".
    pal = t.split()
    for i, w in enumerate(pal[1:], 1):
        prox = pal[i + 1] if i + 1 < len(pal) else ""
        if w in ("d", "dir", "dto", "dta"):
            out.add("D")
        elif w in ("esq", "esqdo", "esqda") or (w == "e" and prox in ("", "sem", "com", "contraste")):
            out.add("E")
    return frozenset(out)


def exame(item) -> dict:
    cl = classe(item)
    t = norm(item)
    sub = next((n for n, rx in SUBTIPO.get(cl, []) if re.search(rx, t)), "")
    lab = frozenset(w for w in t.split() if w not in _LAB_FORA) if cl == "Laboratório" else frozenset()
    reg = regioes(item)
    return {"classe": cl, "sub": sub, "regioes": reg, "lados": lados(item) if not reg or reg - _COLUNA else frozenset(),
            "lab": lab, "texto": str(item or "").strip()}


_COLUNA = {"coluna", "coluna lombar", "coluna cervical", "coluna toracica"}


def _regiao_casa(a: frozenset, b: frozenset) -> bool:
    if not a or not b:
        return False  # revisao E3: regiao nao dita = na duvida, NAO e o mesmo (nao barra)
    if a & b:
        return True
    # "coluna" sem segmento casa com qualquer segmento da coluna (nao com a coluna total)
    return bool(("coluna" in a and b & _COLUNA) or ("coluna" in b and a & _COLUNA))


def mesmo_exame(a, b) -> bool:
    """a e b (texto ou exame()) sao o mesmo documento? Mesma classe + mesma regiao + lado compativel."""
    a = a if isinstance(a, dict) else exame(a)
    b = b if isinstance(b, dict) else exame(b)
    if a["classe"] != b["classe"] or (a["sub"] and b["sub"] and a["sub"] != b["sub"]):
        return False
    if a["classe"] == "Laboratório":
        x, y = a["lab"], b["lab"]
        return bool(x and y) and (x <= y or y <= x)
    if a["classe"] in ("Densitometria", "Cardiologia") and not a["regioes"] and not b["regioes"]:
        return True  # exame sem regiao (densitometria, ECG, risco cirurgico): o mesmo subtipo e o mesmo exame
    if not _regiao_casa(a["regioes"], b["regioes"]):
        return False
    la, lb = a["lados"], b["lados"]
    return not la or not lb or bool(la & lb)


def itens_do_pedido(free_text) -> list:
    """Linhas de exame do texto do pedido (sem SOLICITO, HD, CID, observacoes)."""
    out = []
    for l in str(free_text or "").splitlines():
        s = l.strip(" \t-•*:")
        if not s or not re.search(r"[A-Za-z]", s) or _NAO_ITEM.match(norm(s)) or s.startswith("("):
            continue
        out.append(s)
    return out


# ---------------------------------------------------------------- remedios --------------------------------------------
# Abreviacao FALADA do proprio principio (nao e marca): so as que o Valth usa e foram ouvidas. Marca vai pela tabela.
ABREVIACOES = {"leva": "levofloxacino", "levo": "levofloxacino", "levoflox": "levofloxacino"}
GRAFIAS = {"levofloxacina": "levofloxacino", "ciprofloxacina": "ciprofloxacino"}
_TAB = {"mtime": None, "marcas": {}, "principios": set()}


def _tabela() -> dict:
    try:
        mt = ANVISA.stat().st_mtime
    except OSError:
        return _TAB
    if mt != _TAB["mtime"]:
        try:
            marcas = json.loads(ANVISA.read_text(encoding="utf-8")).get("marcas") or {}
        except Exception:
            return _TAB
        m = {k: ([v] if isinstance(v, str) else list(v)) for k, v in marcas.items()}
        princ = {x.strip() for cs in m.values() for c in cs for x in c.split(" + ") if x.strip()}
        _TAB.update(mtime=mt, marcas=m, principios=princ)
    return _TAB


def _canon(p: str) -> str:
    return GRAFIAS.get(p, p)


# revisao E3: sal antes do principio ("CLORIDRATO DE TRAMADOL" = tramadol). A tabela da ANVISA ja vem sem o sal.
SAIS = {"cloridrato", "dicloridrato", "bromidrato", "sodico", "sodica", "potassico", "potassica", "calcico", "calcica",
        "maleato", "besilato", "mesilato", "citrato", "succinato", "tartarato", "fumarato", "hemifumarato", "acetato",
        "monoidratado", "monoidratada", "diidratado", "di", "hidratado", "trometamol", "dipropionato", "valerato"}


def _achar(pal: list):
    """Principio(s) pela tabela (principio, grafia, abreviacao falada ou marca), ou None se a tabela nao conhece."""
    tab = _tabela()
    for n in range(min(4, len(pal)), 0, -1):
        k = " ".join(pal[:n])
        if len(k) < 3:
            continue
        if k in tab["principios"] or k in GRAFIAS:
            return frozenset({_canon(k)})
        if n == 1 and k in ABREVIACOES:
            return frozenset({ABREVIACOES[k]})
        comp = tab["marcas"].get(k)
        if comp:
            if len(comp) == 1:
                return frozenset(_canon(x.strip()) for x in comp[0].split(" + "))
            return frozenset()  # marca com composicoes diferentes: nao escolhe (nunca deduzir)
    return None


def _palavras(parte: str) -> list:
    return [w for w in norm(parte).split() if not re.fullmatch(r"\d[\d.,]*\w{0,3}", w)]


def _sem_sal(pal: list) -> list:
    out = [w for w in pal if w not in SAIS]
    while out and out[0] in ("de", "do", "da"):
        out = out[1:]
    return out


def _um_nome(parte: str) -> frozenset:
    pal = _palavras(parte)
    if not pal:
        return frozenset()
    limpo = _sem_sal(pal)
    for cand in ([limpo] if limpo != pal else []) + [pal]:
        achou = _achar(cand) if cand else None
        if achou is not None:
            return achou
    w = next((x for x in (limpo or pal) if len(x) >= 3 and not x.isdigit()), "")
    return frozenset({w}) if w else frozenset()


def conhecido(parte) -> bool:
    """A tabela conhece este nome (principio, marca ou abreviacao falada)?"""
    pal = _palavras(str(parte or ""))
    return bool(pal) and any(_achar(c) for c in (_sem_sal(pal), pal) if c)


def principios(nome) -> frozenset:
    """'CIBEX 200MG' -> {'celecoxibe'}; 'PREGABALINA 75MG + DULOXETINA 30MG' -> {'pregabalina', 'duloxetina'}.
    Nome que a tabela nao conhece: a 1a palavra (como antes), sem adivinhar."""
    nome = re.sub(r"⚠️?|\s*-{3,}.*$", " ", str(nome or ""), flags=re.S)
    out = set()
    for parte in re.split(r"\s\+\s|\+", nome):
        s = _um_nome(parte)
        if not s and norm(parte):  # marca ambigua: fica a palavra, para nao virar "nada"
            s = frozenset({norm(parte).split()[0]})
        out |= s
    return frozenset(out)


def chave_remedio(nome) -> str:
    """Chave unica do remedio (pergunta, botao, placar): o principio ativo do 1o remedio do nome."""
    primeira = re.split(r"\s\+\s|\+", re.sub(r"⚠️?", " ", str(nome or "")))[0]
    p = sorted(principios(primeira))
    return " + ".join(p)


def mesmo_remedio(a, b) -> bool:
    """Mesmo remedio = mesmo principio ativo. Formula (A + B + C): a mesma se uma contem a outra ou dividem 2 ou mais."""
    x = a if isinstance(a, frozenset) else principios(a)
    y = b if isinstance(b, frozenset) else principios(b)
    if not x or not y:
        return False
    return x <= y or y <= x or len(x & y) >= 2


_INSTR = re.compile(r"^(uso|tomar|tome|aplicar|aplique|via|fazer|usar|colocar|obs|orient\w*|retorno|em|se|apos|por|"
                    r"durante|ate|enquanto|ao|a|pela|pelo|de|manter|suspender|trocar|\d)\b")


def remedios_da_receita(texto) -> list:
    """Nomes dos remedios do texto de uma receita (linha com '----'; sem traco, a linha que nao e instrucao E tem dose/
    quantidade ou e um nome que a tabela conhece: "Gelo local" e "Repouso relativo" nao sao remedio)."""
    linhas = [l.strip() for l in str(texto or "").splitlines()]
    com_traco = any(re.search(r"-{3,}", l) for l in linhas)
    out = []
    for s in linhas:
        if not s or re.match(r"(?i)^uso\s+\S+\s*$", s):
            continue
        if com_traco:
            if re.search(r"-{3,}", s):
                out.append(re.split(r"\s*-{3,}", s)[0].strip())
        elif not _INSTR.match(norm(s) or "x") and (re.search(r"\d", s) or conhecido(s)):
            out.append(s)
    return out


# ---------------------------------------------------------------- documentos de hoje ----------------------------------
def do_dia(doc: dict, hoje: str) -> bool:
    return str(doc.get("date") or "")[:10] == hoje or str(doc.get("created_at") or "")[:10] == hoje


def hora(doc: dict) -> str:
    """HH:MM (horario de Brasilia) de quando o documento foi feito; '' se nao der para saber."""
    c = str(doc.get("created_at") or "")
    try:
        d = datetime.datetime.fromisoformat(c.replace("Z", "+00:00"))
    except ValueError:
        return ""
    if d.tzinfo:
        d = d.astimezone(FUSO)
    return d.strftime("%H:%M") if len(c) > 10 else ""


def exame_ja_feito(item, exams: list, hoje: str):
    """(doc, linha) do pedido/guia de hoje que ja tem este exame, ou None. exams = GET /patients/{pid}/exams."""
    alvo = exame(item)
    for e in exams or []:
        if not do_dia(e, hoje):
            continue
        for linha in itens_do_pedido(e.get("free_text")):
            if mesmo_exame(alvo, linha):
                return e, linha
    return None


def remedio_ja_receitado(nome, prescriptions: list, hoje: str):
    """(doc, nome) da receita de hoje que ja tem este remedio (pelo principio ativo), ou None."""
    alvo = principios(nome)
    if not alvo:
        return None
    for r in prescriptions or []:
        if not do_dia(r, hoje):
            continue
        for outro in remedios_da_receita(r.get("instructions")):
            if mesmo_remedio(alvo, outro):
                return r, outro
    return None


def aviso(kind: str, doc: dict, descr: str) -> str:
    """'ja existe exame 475 (TOMOGRAFIA DA COLUNA LOMBOSSACRA), feito as 09:40'."""
    h = hora(doc)
    return f"ja existe {kind} {doc.get('id')} ({' '.join(str(descr).split())[:70]})" + (f", feito as {h}" if h else "")


# ================================================================ CHAVES DO EMISSOR (27/11/2026, P2) ==================
# Uma chave por ITEM do documento. A chave exata vai para o indice unico do banco (trava dura); a comparacao "por
# significado" (lado nao dito casa com qualquer lado, fisio sem regiao casa com qualquer regiao, marca = principio)
# roda dentro da fila por paciente (services/emissor.py).
#   exame:   classe|subtipo|regiao|lado          ex. ressonancia||joelho|D   (bilateral = 2 chaves, D e E)
#   lab:     lab|TUSS (so laboratorio: o TUSS de RM e o mesmo para qualquer articulacao); sem TUSS, as palavras
#   fisio:   fisio|tipo|regiao  SEM LADO (decisao do Valth 27/11: ombro D e ombro E no mesmo dia = 1 documento)
#   receita: principio ativo (tabela ANVISA)
#   encaminhamento: destino; atestado: um por dia; justificativa: a chave do exame que ela justifica
TIPOS_EMISSOR = ("receita", "exame", "fisio", "encaminhamento", "atestado", "justificativa")

# TUSS do LABORATORIO (Tabela TUSS 3.5 Unimed), as mesmas linhas do consulta.py do PC (28/10 e 25/11/2026).
TUSS_LAB = [
    (r"HEMOGRAMA", "40304361"), (r"GLICEMIA DE JEJUM|^GLICOSE", "40302040"),
    (r"HEMOGLOBINA GLICADA|HBA1C", "40302733"), (r"^COLESTEROL TOTAL$", "40301605"),
    (r"^COLESTEROL HDL|^HDL", "40301583"), (r"^COLESTEROL LDL|^LDL", "40301591"),
    (r"^COLESTEROL VLDL|^VLDL", "40302695"), (r"TRIGLICER", "40302547"),
    (r"^UREIA$", "40302580"), (r"^CREATININA$", "40301630"), (r"^TGO|\bAST\b", "40302504"),
    (r"^TGP|\bALT\b", "40302512"), (r"GAMA.?GT|GAMA.?GLUTAMIL", "40301990"), (r"^TSH", "40316521"),
    (r"^T4 LIVRE", "40316491"), (r"^VHS|HEMOSSEDIMENTA", "40304370"),
    (r"PROTEINA C REATIVA|\bPCR\b", "40308391"), (r"VITAMINA B12", "40316572"),
    (r"VITAMINA D", "40302830"), (r"^FSH", "40316289"), (r"^LH$", "40316335"),
    (r"^ESTRADIOL", "40316246"), (r"^AMILASE$", "40301281"), (r"^LIPASE$", "40302199"), (r"^CALCITONINA", "40316165"),
    (r"^PROGESTERONA", "40316408"), (r"^ACIDO URICO", "40301150"), (r"^FERRITINA", "40316270"),
    (r"^FERRO SERICO", "40301842"), (r"^HOMOCISTEINA", "40302113"), (r"^CALCIO IONICO", "40301419"),
    (r"^CALCIO", "40301400"), (r"^FOSFORO", "40301931"), (r"^MAGNESIO", "40302237"), (r"PARATORMONIO|PTH", "40305465"),
    (r"^FOSFATASE ALCALINA", "40301885"), (r"ANTI.?TPO|ANTIPEROXIDASE|ANTI.?PEROXIDASE", "40306437"),
    (r"ANTITIREOGLOBULINA|ANTI.?TIREOGLOBULINA", "40316106"), (r"^PROLACTINA", "40316416"),
    (r"URINA TIPO 1|EAS|ROTINA DE URINA|SUMARIO DE URINA", "40311210"), (r"^UROCULTURA", "40310213"),
    (r"^INSULINA", "40316360"), (r"ACIDO FOLICO", "40301087"), (r"^TESTOSTERONA LIVRE", "40316505"),
    (r"^TESTOSTERONA", "40316513"), (r"^PSA LIVRE", "40316130"), (r"^PSA", "40316149"),
    (r"TEMPO DE PROTROMBINA|\bTP\b|INR", "40304590"), (r"TTPA|TROMBOPLASTINA", "40304639"),
    (r"COAGULOGRAMA", "40304922"), (r"^SODIO", "40302423"), (r"^POTASSIO", "40302318"),
    (r"BILIRRUBINA", "40301397"), (r"PROTEINAS TOTAIS", "40302385"), (r"PARASITOLOGICO", "40303110"),
]


def tuss_lab(item) -> str:
    d = unicodedata.normalize("NFD", str(item or "")).encode("ascii", "ignore").decode().upper().strip()
    d = re.sub(r"\s*\|.*$", "", d)
    for rx, cod in TUSS_LAB:
        if re.search(rx, d):
            return cod
    return ""


def _slug(t) -> str:
    return norm(t).replace(" ", "_")


def sem_qtd(item) -> str:
    """'RNM DO JOELHO D|1' -> 'RNM DO JOELHO D' (a quantidade da guia nao faz parte do item)."""
    return re.sub(r"\s*\|.*$", "", str(item or "")).strip()


def eh_fisio(item) -> bool:
    return classe(item) == "Fisioterapia"


def tipo_fisio(item) -> str:
    """rpg | hidro | acupuntura | motora. "FISIOTERAPIA" sem tipo dito = motora (o padrao da casa)."""
    t = norm(item)
    if re.search(r"\brpg\b|reeducacao postural", t):
        return "rpg"
    if re.search(r"hidroterap", t):
        return "hidro"
    if re.search(r"acupunt", t):
        return "acupuntura"
    return "motora"


def regiao_fisio(item) -> str:
    """Regiao da fisio, sem lado; '*' quando nao dita (casa com qualquer regiao)."""
    r = regioes(item)
    return "+".join(sorted(r)) if r else "*"


def chave_fisio(item) -> str:
    return f"fisio|{tipo_fisio(item)}|{regiao_fisio(item)}"


def chaves_exame(item) -> list:
    """Chaves exatas de UM item de exame (bilateral = uma por lado)."""
    texto = sem_qtd(item)
    e = exame(texto)
    cl = e["classe"]
    if cl == "Laboratório":
        cod = tuss_lab(texto)
        return ["lab|" + (cod or "+".join(sorted(e["lab"])) or _slug(texto)[:60])]
    if cl == "Fisioterapia":
        return [chave_fisio(texto)]
    reg = "+".join(sorted(e["regioes"]))
    if not reg:
        if cl in ("Densitometria", "Cardiologia"):
            reg = "-"
        else:  # regiao nao dita: na duvida NAO e o mesmo; so o texto igual colide
            reg = "?" + _slug(texto)[:40]
    base = f"{_slug(cl)}|{e['sub']}|{reg}"
    if not e["lados"]:
        return [base + "|*"]
    return [f"{base}|{l}" for l in sorted(e["lados"])]


_ENC_FORA = {"encaminhamento", "encaminho", "encaminhar", "para", "ao", "a", "o", "de", "da", "do", "dr", "dra",
             "servico", "avaliacao", "e", "conduta", "com", "especialista", "em", "medico", "medica", "consulta"}


def chave_encaminhamento(texto) -> str:
    linhas = [l for l in str(texto or "").splitlines() if l.strip()]
    t = re.sub(r"^\s*encaminhamento\s*[^a-zA-Z0-9]+\s*", "", linhas[0] if linhas else "", flags=re.I)
    pal = [w for w in norm(t).split() if w not in _ENC_FORA][:3]
    return "enc|" + ("_".join(pal) or "?")


def chaves_item(tipo: str, item) -> list:
    """[(tipo_efetivo, chave)] de um item. Fisio dentro de guia, pedido ou encaminhamento vira tipo 'fisio'."""
    item = sem_qtd(item)
    if tipo == "receita":
        k = " + ".join(sorted(principios(item)))
        return [("receita", "rx|" + (k or _slug(item)[:60]))]
    if tipo == "atestado":
        return [("atestado", "atestado")]
    if tipo == "fisio" or (tipo in ("exame", "encaminhamento") and eh_fisio(item)):
        return [("fisio", chave_fisio(item))]
    if tipo == "encaminhamento":
        return [("encaminhamento", chave_encaminhamento(item))]
    if tipo == "justificativa":
        return [("justificativa", "just|" + k) for k in chaves_exame(item)]
    return [("exame", k) for k in chaves_exame(item)]


def mesma_fisio(a, b) -> bool:
    """Mesmo tipo de fisio (motora, RPG...) e regiao compativel; o LADO nao conta (decisao do Valth 27/11)."""
    if tipo_fisio(a) != tipo_fisio(b):
        return False
    ra, rb = regioes(a), regioes(b)
    return not ra or not rb or _regiao_casa(ra, rb)


def mesmo_item(tipo: str, a, b) -> bool:
    """O item a (pedido agora) e o item b (ja reservado/feito) sao o mesmo documento, POR SIGNIFICADO?"""
    a, b = sem_qtd(a), sem_qtd(b)
    if tipo == "receita":
        return mesmo_remedio(a, b)
    if tipo == "atestado":
        return True
    if tipo == "fisio":
        return mesma_fisio(a, b)
    if tipo == "encaminhamento":
        x, y = chave_encaminhamento(a), chave_encaminhamento(b)
        if x == y:
            return True
        sx, sy = set(x[4:].split("_")) - {"?"}, set(y[4:].split("_")) - {"?"}
        return bool(sx and sy) and (sx <= sy or sy <= sx)
    return mesmo_exame(a, b)  # exame e justificativa
