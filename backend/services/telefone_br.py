"""
Telefone brasileiro: arrumar o que dá para arrumar, recusar o que não é telefone.

Nasceu de um caso real (20/08): a Maria do Socorro estava com `09400005474` no
campo de telefone — um número de carteirinha digitado no lugar errado. O sistema
aceitou calado, e qualquer mensagem para ela ia falhar em silêncio. Outros seis
cadastros tinham o zero antigo antes do DDD (`083...`).

Duas ideias separadas, de propósito:
  - `normalizar` conserta sozinha o que é inequívoco (zero na frente, +55,
    máscara). Não inventa DDD: número sem DDD continua inválido, porque
    adivinhar a região erraria calado — que é o problema que estamos resolvendo.
  - `validar` diz, em português, por que aquilo não é um telefone.
"""
import re

# DDDs que existem no Brasil (Anatel).
DDDS_VALIDOS = {
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
}


def so_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def normalizar(valor: str | None) -> str:
    """Devolve só os dígitos, no formato DDD + número (10 ou 11 dígitos).

    Arruma: máscara, +55 na frente, e o zero antigo de operadora (083 -> 83).
    NÃO arruma: número sem DDD — não há como saber a região.
    """
    d = so_digitos(valor)
    if not d:
        return ""
    # +55 do país, quando o resto tem tamanho de telefone
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    # zero de operadora antes do DDD
    if d.startswith("0") and len(d) in (11, 12):
        d = d[1:]
    return d


def validar(valor: str | None) -> str | None:
    """None = telefone válido. Caso contrário, o motivo, em português."""
    d = normalizar(valor)
    if not d:
        return None  # vazio é permitido; quem exige telefone é quem chama
    if len(d) < 10:
        return (f"{len(d)} dígitos — falta o DDD "
                f"(escreva com DDD, ex.: 81 9 9999-9999)")
    if len(d) > 11:
        return (f"{len(d)} dígitos — isso não é um telefone "
                f"(confira se não digitou CPF ou carteirinha no campo errado)")
    if int(d[:2]) not in DDDS_VALIDOS:
        return f"DDD {d[:2]} não existe no Brasil"
    if len(d) == 11 and d[2] != "9":
        return "celular com 11 dígitos precisa começar com 9 depois do DDD"
    # Número local no Brasil nunca começa com 0 nem 1 — nem fixo (2–5) nem
    # celular (6–9, incluindo os antigos de 8 dígitos que ainda vêm do bot).
    # Sem esta regra, `09400005474` (a carteirinha da Maria do Socorro) perdia
    # o zero da frente e passava disfarçada de fixo do Pará. A primeira versão
    # desta regra exigia 2–5 e derrubava celular antigo legítimo: o teste
    # pegou os dois erros antes de ir para o ar.
    if len(d) == 10 and d[2] in "01":
        return ("não parece telefone: depois do DDD, número brasileiro não "
                "começa com 0 nem 1 (confira se não é CPF ou carteirinha)")
    return None


def formatar(valor: str | None) -> str:
    """(81) 9 9999-9999 — para mostrar na tela. Guardar, guardamos só dígitos."""
    d = normalizar(valor)
    if len(d) == 11:
        return f"({d[:2]}) {d[2]} {d[3:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return valor or ""
