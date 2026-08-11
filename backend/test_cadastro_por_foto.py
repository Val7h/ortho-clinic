# -*- coding: utf-8 -*-
"""Testes do cadastro de paciente por foto.
Executar com: pytest backend/test_cadastro_por_foto.py -v
"""
import pytest

from routers.patients import _cpf_valido, LER_FOTO_CAMPOS, LER_FOTO_TIPOS


def test_cpf_valido_aceita_cpf_correto():
    assert _cpf_valido("529.982.247-25") is True
    assert _cpf_valido("52998224725") is True


def test_cpf_valido_recusa_digito_trocado():
    # É o erro típico da leitura de print: um dígito diferente.
    assert _cpf_valido("52998224726") is False
    assert _cpf_valido("52998224715") is False


def test_cpf_valido_recusa_lixo():
    assert _cpf_valido("") is False
    assert _cpf_valido(None) is False
    assert _cpf_valido("123") is False
    assert _cpf_valido("11111111111") is False   # todos iguais
    assert _cpf_valido("abcdefghijk") is False


def test_campos_permitidos_nao_incluem_nada_clinico():
    """O modelo não pode gravar dado clínico nem escolher a organização."""
    proibidos = {
        "id", "organization_id", "active", "notes", "allergies",
        "chronic_conditions", "current_medications", "photo_url",
    }
    assert proibidos.isdisjoint(set(LER_FOTO_CAMPOS))
    assert "name" in LER_FOTO_CAMPOS
    assert "address_neighborhood" in LER_FOTO_CAMPOS


def test_tipos_de_imagem_aceitos():
    assert LER_FOTO_TIPOS == {"image/png", "image/jpeg", "image/webp"}
    assert "application/pdf" not in LER_FOTO_TIPOS
