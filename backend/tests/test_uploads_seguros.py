"""Arquivo em /uploads nunca roda como página (19/11/2026). Roda isolado: python tests/test_uploads_seguros.py"""
import os, sys, shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
from unittest import mock
from fastapi.testclient import TestClient
import main
import services.storage as S

PASTA = os.path.join("uploads", "zz_teste_revisao")


def _cliente():
    os.makedirs(PASTA, exist_ok=True)
    open(os.path.join(PASTA, "x.html"), "w").write("<script>alert(1)</script>")
    open(os.path.join(PASTA, "y.svg"), "w").write("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>")
    open(os.path.join(PASTA, "z.pdf"), "wb").write(b"%PDF-1.4 teste")
    return TestClient(main.app)


def test_html_e_svg_viram_download_de_texto():
    with mock.patch.object(S, "ler_do_banco", return_value=None):
        c = _cliente()
        for nome in ("x.html", "y.svg"):
            r = c.get(f"/uploads/zz_teste_revisao/{nome}")
            assert r.status_code == 200, nome
            assert r.headers["content-type"].startswith("text/plain"), (nome, r.headers["content-type"])
            assert r.headers.get("content-disposition") == "attachment"
            assert r.headers.get("x-content-type-options") == "nosniff"


def test_pdf_continua_abrindo_igual():
    with mock.patch.object(S, "ler_do_banco", return_value=None):
        r = _cliente().get("/uploads/zz_teste_revisao/z.pdf")
        assert r.status_code == 200 and "pdf" in r.headers["content-type"]
        assert "content-disposition" not in r.headers
        assert r.headers.get("x-content-type-options") == "nosniff"


def test_vindo_do_banco_tambem():
    with mock.patch.object(S, "ler_do_banco", return_value=(b"<html>x</html>", "text/html")):
        r = _cliente().get("/uploads/zz_teste_revisao/qualquer.html")
        assert r.headers["content-type"].startswith("text/plain")


if __name__ == "__main__":
    try:
        for k, f in list(globals().items()):
            if k.startswith("test_"):
                f(); print("OK", k)
    finally:
        shutil.rmtree(PASTA, ignore_errors=True)
