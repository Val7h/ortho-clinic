"""Páginas de PDF como PNG, em lotes, com teto de concorrência.

25/11/2026: o `ortho-clinic` (512 MB) foi morto por falta de memória quando
vários `GET .../paginas` rasterizavam o PDF inteiro ao mesmo tempo. Cada
página A4 a 170 DPI segura cerca de 8 MB de pixmap. O código antigo não
fechava o pixmap nem o documento, e a RAM subia em degraus que não voltavam.

Aqui o pixmap é descartado antes da página seguinte, o cache do MuPDF é
esvaziado a cada lote de 5, o documento é fechado no fim e no máximo duas
renderizações ocupam o processo. O trabalho pesado fica nesta função síncrona,
chamada pelo endpoint sync — fora do event loop.
"""
from __future__ import annotations

import base64
import threading
from typing import Optional

LOTE = 5
DPI = 170
VAGAS = 2

_vagas = threading.BoundedSemaphore(VAGAS)
_mu = threading.Lock()
_pixmap_vivos = 0
_pico_pixmap_bytes = 0


class PdfInvalido(Exception):
    """O arquivo não abriu como PDF, ou não tem páginas."""


class PdfGrandeDemais(PdfInvalido):
    """A fila da impressora recusa PDF vazio ou com mais de 12 páginas."""


def pico_pixmap_bytes() -> int:
    with _mu:
        return _pico_pixmap_bytes


def zerar_pico_pixmap() -> None:
    global _pixmap_vivos, _pico_pixmap_bytes
    with _mu:
        _pixmap_vivos = 0
        _pico_pixmap_bytes = 0


def _marca_pixmap(n: int) -> None:
    global _pixmap_vivos, _pico_pixmap_bytes
    with _mu:
        _pixmap_vivos += n
        if _pixmap_vivos > _pico_pixmap_bytes:
            _pico_pixmap_bytes = _pixmap_vivos


def _solta_pixmap(n: int) -> None:
    global _pixmap_vivos
    with _mu:
        _pixmap_vivos -= n


def _esvaziar_cache(fitz) -> None:
    try:
        # percent >= 100 chama fz_empty_store(); store_maxsize nesta versão
        # do PyMuPDF é um stub e não limita nada.
        fitz.TOOLS.store_shrink(100)
    except Exception:
        pass


def renderizar_paginas(
    conteudo: bytes,
    *,
    offset: int = 0,
    limite: Optional[int] = None,
    max_paginas: Optional[int] = None,
) -> dict:
    """Rasteriza o trecho [offset, offset+limite).

    ``limite is None`` percorre até o fim, ainda assim em blocos de ``LOTE``:
    cada bloco devolve as imagens já comprimidas e solta pixmap e cache antes
    do próximo. ``max_paginas`` recusa o arquivo inteiro antes de rasterizar
    (a impressora da clínica usa 12).
    """
    import fitz

    with _vagas:
        return _renderizar_sem_trava(
            conteudo, offset=offset, limite=limite, max_paginas=max_paginas, fitz=fitz
        )


def _renderizar_sem_trava(
    conteudo: bytes,
    *,
    offset: int = 0,
    limite: Optional[int] = None,
    max_paginas: Optional[int] = None,
    fitz=None,
) -> dict:
    if fitz is None:
        import fitz as fitz  # noqa: PLW0621
    pdf = None
    try:
        try:
            pdf = fitz.open(stream=conteudo, filetype="pdf")
        except Exception as exc:
            raise PdfInvalido("O arquivo não é um PDF") from exc
        total = int(pdf.page_count or 0)
        if total <= 0 or (max_paginas is not None and total > max_paginas):
            if max_paginas is not None:
                raise PdfGrandeDemais("PDF vazio ou grande demais")
            raise PdfInvalido("PDF vazio")
        inicio = min(max(0, offset), total)
        fim = total if limite is None else min(total, inicio + max(0, limite))
        rect = pdf[0].rect
        largura = round(rect.width / 72 * 25.4, 1)
        altura = round(rect.height / 72 * 25.4, 1)
        paginas: list[str] = []
        cursor = inicio
        while cursor < fim:
            bloco_fim = min(cursor + LOTE, fim)
            for n in range(cursor, bloco_fim):
                pagina = pdf.load_page(n)
                try:
                    pix = pagina.get_pixmap(dpi=DPI, alpha=False)
                    n_bytes = pix.width * pix.height * pix.n
                    _marca_pixmap(n_bytes)
                    try:
                        png = pix.tobytes("png")
                    finally:
                        _solta_pixmap(n_bytes)
                        del pix
                finally:
                    del pagina
                paginas.append("data:image/png;base64," + base64.b64encode(png).decode("ascii"))
                del png
            _esvaziar_cache(fitz)
            cursor = bloco_fim
        return {
            "paginas": paginas,
            "largura_mm": largura,
            "altura_mm": altura,
            "total": total,
            "offset": inicio,
        }
    finally:
        if pdf is not None:
            pdf.close()
        _esvaziar_cache(fitz)
