"""Raster de PDF em lotes: o pico de pixmap não cresce com o número de páginas.

Roda isolado:
    cd backend && python -m pytest -q --noconftest tests/test_pdf_paginas_memoria.py
"""
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
import pytest

from services import pdf_paginas as P
from services.pdf_paginas import (
    PdfGrandeDemais,
    PdfInvalido,
    pico_pixmap_bytes,
    renderizar_paginas,
    zerar_pico_pixmap,
)


def _pdf(n: int) -> bytes:
    doc = fitz.open()
    try:
        for i in range(n):
            pagina = doc.new_page()
            pagina.insert_text((72, 72), f"pagina {i} " + ("texto da guia " * 30))
        return doc.tobytes()
    finally:
        doc.close()


def test_lotes_cobrem_o_pdf_sem_passar_de_cinco():
    dados = _pdf(12)
    visto = []
    offset = 0
    total = 12
    while offset < total:
        bloco = renderizar_paginas(dados, offset=offset, limite=5)
        assert bloco["total"] == 12
        assert len(bloco["paginas"]) <= 5
        assert bloco["paginas"]
        assert bloco["paginas"][0].startswith("data:image/png;base64,")
        assert 200 < bloco["largura_mm"] < 220
        assert bloco["altura_mm"] > bloco["largura_mm"]
        visto.extend(bloco["paginas"])
        offset += len(bloco["paginas"])
    assert len(visto) == 12
    assert len(set(visto)) == 12


def test_pico_de_pixmap_nao_cresce_com_o_numero_de_paginas():
    """Uma página A4 a 170 DPI fica na casa dos 8 MB. Doze páginas seguradas
    juntas passariam de 90 MB. O pico tem de ser o de UMA página."""
    zerar_pico_pixmap()
    renderizar_paginas(_pdf(1), limite=5)
    uma = pico_pixmap_bytes()
    assert uma > 1_000_000

    zerar_pico_pixmap()
    dados = _pdf(12)
    offset = 0
    total = 12
    while offset < total:
        bloco = renderizar_paginas(dados, offset=offset, limite=5)
        total = bloco["total"]
        offset += len(bloco["paginas"])
    muitas = pico_pixmap_bytes()
    assert muitas <= int(uma * 1.05) + 1024, (uma, muitas)


def test_tracemalloc_lote_fica_abaixo_de_segurar_todas_as_paginas():
    import tracemalloc

    dados = _pdf(10)
    tracemalloc.start()
    tracemalloc.reset_peak()
    offset = 0
    total = 10
    while offset < total:
        bloco = renderizar_paginas(dados, offset=offset, limite=5)
        total = bloco["total"]
        offset += len(bloco["paginas"])
        del bloco
    _, pico_lote = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    tracemalloc.start()
    tracemalloc.reset_peak()
    doc = fitz.open(stream=dados, filetype="pdf")
    presos = []
    try:
        for pagina in doc:
            pix = pagina.get_pixmap(dpi=170)
            presos.append(pix.samples)
    finally:
        doc.close()
    _, pico_cheio = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    del presos
    fitz.TOOLS.store_shrink(100)
    assert pico_lote * 2 < pico_cheio, (pico_lote, pico_cheio)


def test_recusa_pdf_invalido_e_guia_grande_demais_sem_rasterizar():
    with pytest.raises(PdfInvalido) as erro:
        renderizar_paginas(b"nao e um pdf")
    assert not isinstance(erro.value, PdfGrandeDemais)

    zerar_pico_pixmap()
    with pytest.raises(PdfGrandeDemais):
        renderizar_paginas(_pdf(13), max_paginas=12)
    assert pico_pixmap_bytes() == 0

    saida = renderizar_paginas(_pdf(12), max_paginas=12)
    assert saida["total"] == 12
    assert len(saida["paginas"]) == 12


def test_no_maximo_duas_renderizacoes_simultaneas(monkeypatch):
    estado = {"atual": 0, "pico": 0}
    trava = threading.Lock()

    def lenta(conteudo, *, offset=0, limite=None, max_paginas=None, fitz=None):
        with trava:
            estado["atual"] += 1
            estado["pico"] = max(estado["pico"], estado["atual"])
        try:
            time.sleep(0.15)
            return {"paginas": ["x"], "largura_mm": 210.0, "altura_mm": 297.0, "total": 1, "offset": 0}
        finally:
            with trava:
                estado["atual"] -= 1

    monkeypatch.setattr(P, "_renderizar_sem_trava", lenta)
    fios = [threading.Thread(target=renderizar_paginas, args=(b"%PDF",)) for _ in range(4)]
    for fio in fios:
        fio.start()
    for fio in fios:
        fio.join()
    assert estado["pico"] == P.VAGAS


def test_middleware_preserva_content_length_num_json_grande():
    """O corpo reenviado pelo BaseHTTPMiddleware estourava o Content-Length.
    A pilha nova só acrescenta cabeçalho; o tamanho tem de bater com o corpo."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.v1.middleware import (
        AuditLogMiddleware,
        RateLimitMiddleware,
        RequestIDMiddleware,
        ResponseTimeMiddleware,
    )
    from middleware.audit_middleware import AuditContextMiddleware

    app = FastAPI()
    app.add_middleware(AuditLogMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(ResponseTimeMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(AuditContextMiddleware)

    blob = "x" * 500_000

    @app.get("/grande")
    def grande():
        return {"blob": blob}

    resposta = TestClient(app).get("/grande")
    assert resposta.status_code == 200
    assert int(resposta.headers["content-length"]) == len(resposta.content)
    assert resposta.headers.get("x-request-id")
    assert resposta.headers.get("x-response-time", "").endswith("ms")
    assert resposta.json()["blob"] == blob
