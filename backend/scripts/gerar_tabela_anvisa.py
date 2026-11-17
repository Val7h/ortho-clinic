r"""Gera a tabela compacta marca -> principio(s) ativo(s) a partir de DADOS_ABERTOS_MEDICAMENTOS.csv (ANVISA).
Uso: python -I scripts/gerar_tabela_anvisa.py <csv> <saida.json>
So registros com SITUACAO_REGISTRO == Ativo. Nome e principio sem acento, minusculas. Sal/forma tirados do principio.
"""
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date


def norm(t):
    t = "".join(c for c in unicodedata.normalize("NFD", str(t or "")) if unicodedata.category(c) != "Mn").lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


SAL_ANTES = r"(?:cloridrato|dicloridrato|bromidrato|maleato|dimaleato|fumarato|hemifumarato|succinato|tartarato|bitartarato|" \
            r"citrato|sulfato|fosfato|acetato|besilato|besilato|mesilato|tosilato|valerato|propionato|dipropionato|" \
            r"cipionato|undecilato|hiclato|cloreto|nitrato|mononitrato|pamoato|estolato|estearato|lactato|gliconato|" \
            r"oxalato|benzoato|xinafoato|furoato|pivalato|palmitato|decanoato|enantato|hexaidratado|bissulfato|" \
            r"hemitartarato|cridrato|levomalato|malato|monoidratado|hidrobrometo|sodio|potassio|calcio|magnesio|zinco)"
SAL_DEPOIS = r"(?:sodic[oa]|potassic[oa]|calcic[oa]|magnesic[oa]|dissodic[oa]|trissodic[oa]|monossodic[oa]|" \
             r"monoidratad[oa]|diidratad[oa]|triidratad[oa]|hemi[a-z]*idratad[oa]|sesqui[a-z]*idratad[oa]|" \
             r"anidr[oa]|hidratad[oa]|di[a-z]*idratad[oa]|tri[a-z]*idratad[oa]|tetra[a-z]*idratad[oa]|" \
             r"pentaidratad[oa]|hexaidratad[oa]|micronizad[oa]|base|trometamol|sodica|sodico|potassica|potassico)"


def limpar_principio(p):
    p = norm(p)
    for _ in range(3):
        p0 = p
        p = re.sub(r"^(?:%s)(?: (?:%s))*(?: de)? " % (SAL_ANTES, SAL_DEPOIS), "", p)
        p = re.sub(r"^(?:%s) de " % SAL_DEPOIS, "", p)
        p = re.sub(r"^trometamol ", "", p)
        p = re.sub(r"(?: de (?:sodio|potassio|calcio|magnesio))$", "", p)
        p = re.sub(r"(?: (?:%s|di|tri|tetra|hemi|sesqui|mono|hidratad[oa]|magnesic[oa]|zincic[oa]))+$" % SAL_DEPOIS, "", p)
        if p == p0:
            break
    return p.strip()


def main(csv_path, saida):
    comp = defaultdict(set)
    total = ativos = 0
    with open(csv_path, encoding="latin1", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            total += 1
            if (row.get("SITUACAO_REGISTRO") or "").strip().lower() != "ativo":
                continue
            ativos += 1
            nome = norm(row.get("NOME_PRODUTO"))
            pa = (row.get("PRINCIPIO_ATIVO") or "").strip()
            if not nome or not pa:
                continue
            partes = [limpar_principio(x) for x in re.split(r",(?![^()]*\))", pa)]
            partes = sorted({x for x in partes if x})
            if not partes:
                continue
            comp[nome].add(" + ".join(partes))
    marcas = {}
    pulados = 0
    for nome, cs in comp.items():
        palavras_nome = set(nome.split())
        cs = sorted(cs, key=lambda c: (len(c), c))
        # generico (nome = o proprio principio): nao ajuda, sai da tabela
        if all(set(w for w in re.split(r" \+ | ", c) if len(w) > 3) <= palavras_nome for c in cs):
            pulados += 1
            continue
        marcas[nome] = cs[0] if len(cs) == 1 else cs[:4]
    out = {
        "_fonte": "ANVISA - Dados Abertos: DADOS_ABERTOS_MEDICAMENTOS.csv (https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv)",
        "_gerado_em": date.today().isoformat(),
        "_criterio": "so SITUACAO_REGISTRO=Ativo; nome e principio sem acento, minusculas; sal tirado; genericos (nome = principio) fora",
        "_contagem": {"registros_csv": total, "registros_ativos": ativos, "marcas": len(marcas), "genericos_fora": pulados},
        "marcas": dict(sorted(marcas.items())),
    }
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(out["_contagem"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
