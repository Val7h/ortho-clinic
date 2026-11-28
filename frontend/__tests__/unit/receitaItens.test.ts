// Itens alinhados da receita (regra do Dr. Valth, 27/11; revisão independente 28/11).
import { blocosDaReceita, linhaDeItem, numerosDosItens, type BlocoReceita } from "@/lib/receitaItens";

const itens = (b: BlocoReceita[] | null) => (b || []).filter((x) => x.tipo === "item") as Extract<BlocoReceita, { tipo: "item" }>[];

describe("linhaDeItem: linhas que SÃO remédio", () => {
  test.each([
    ["CELECOXIBE 200MG ---- 1CX", null, "CELECOXIBE 200MG", "1CX"],
    ["1- CELECOXIBE 200MG ------- 1CX", 1, "CELECOXIBE 200MG", "1CX"],
    ["2) ÁCIDO ACETILSALICÍLICO-AAS 100MG -------- 120 CP", 2, "ÁCIDO ACETILSALICÍLICO-AAS 100MG", "120 CP"],
    ["DICLOFENACO DIETILAMÔNIO 11,6MG/G GEL.............1 BISNAGA", null, "DICLOFENACO DIETILAMÔNIO 11,6MG/G GEL", "1 BISNAGA"],
    ["VITAMINA D3 50.000UI ____ 8 CÁPSULAS", null, "VITAMINA D3 50.000UI", "8 CÁPSULAS"],
    ["10 - TRAMADOL 50MG ----- 2 CX", 10, "TRAMADOL 50MG", "2 CX"],
    ["5-FLUOR ---- 1 FR", null, "5-FLUOR", "1 FR"],
    ["NOME MUITO LONGO ---- 01 (UMA) CAIXA COM 30 COMPRIMIDOS", null, "NOME MUITO LONGO", "01 (UMA) CAIXA COM 30 COMPRIMIDOS"],
    ["CETOPROFENO 100MG ---- 1CX", null, "CETOPROFENO 100MG", "1CX"],
    // nome de remédio: qualquer quantidade até 40 caracteres (revisão 28/11)
    ["MELOXICAM 15MG ---- QSP 30 DIAS", null, "MELOXICAM 15MG", "QSP 30 DIAS"],
    ["GABAPENTINA 300MG ---- 60 CP/MÊS", null, "GABAPENTINA 300MG", "60 CP/MÊS"],
    ["CLONAZEPAM 2MG ---- 30 COMPRIMIDOS PARA 30 DIAS", null, "CLONAZEPAM 2MG", "30 COMPRIMIDOS PARA 30 DIAS"],
    ["TRAMADOL ---- 2 CX (60 CP - 30 DIAS)", null, "TRAMADOL", "2 CX (60 CP - 30 DIAS)"],
    ["PREGABALINA 75MG ---- uso contínuo", null, "PREGABALINA 75MG", "uso contínuo"],
    ["CODEÍNA 30MG ---- 1 CX 12 H", null, "CODEÍNA 30MG", "1 CX 12 H"],
    ["DIPIRONA 1G - - - - - 1CX", null, "DIPIRONA 1G", "1CX"],
    ["CICLOBENZAPRINA 5MG + TRAMADOL 50MG----------------------------- 120 CP", null, "CICLOBENZAPRINA 5MG + TRAMADOL 50MG", "120 CP"],
    ["INSIT 50MG ---- UMA CAIXA", null, "INSIT 50MG", "UMA CAIXA"],
    ["PARACETAMOL 750MG -------", null, "PARACETAMOL 750MG", ""],
    ["2- CETOPROFENO 100MG ----", 2, "CETOPROFENO 100MG", ""],
    ["3- LOSARTANA 50MG", 3, "LOSARTANA 50MG", ""],
  ])("%s", (linha, numero, nome, qtd) => {
    const r = linhaDeItem(linha);
    expect(r).not.toBeNull();
    expect(r!.numero).toBe(numero);
    expect(r!.nome).toBe(nome);
    expect(r!.qtd).toBe(qtd);
  });

  test("segundo tracejado: o que vem depois vira posologia", () => {
    const r = linhaDeItem("PREDNISONA 20MG ---- 1 CX ---- TOMAR 1 CP");
    expect(r).toMatchObject({ nome: "PREDNISONA 20MG", qtd: "1 CX", resto: "TOMAR 1 CP" });
  });
});

describe("linhaDeItem: posologia com tracejado NÃO vira remédio", () => {
  test.each([
    "TOMAR 1 CP DE 8/8H ---- SE DOR",
    "Aplicar no local.... 3x ao dia",
    "12/12H ---- 7 DIAS",
    "Uso contínuo",
    "TOMAR 1 CP AO DIA",
    "1 CP DE 12/12H ---- POR 7 DIAS",
    // separador com só 3 marcas não é o tracejado do emissor ("----")
    "CETOPROFENO 100MG --- 1CX",
  ])("%s", (linha) => {
    expect(linhaDeItem(linha)).toBeNull();
  });
});

describe("blocosDaReceita", () => {
  test("formato do emissor: linha em branco entre o remédio e a posologia", () => {
    const b = blocosDaReceita("USO ORAL\n\nCELECOXIBE 200MG ------------ 1CX\n\nTOMAR 1 CP DE 12 EM 12H.");
    expect(b).not.toBeNull();
    expect(b![0]).toEqual({ tipo: "via", texto: "USO ORAL" });
    expect(itens(b)).toEqual([{ tipo: "item", numero: null, nome: "CELECOXIBE 200MG", qtd: "1CX", posologia: ["TOMAR 1 CP DE 12 EM 12H."] }]);
  });

  test("linha numerada abre item novo mesmo sem quantidade (1, 2 e 3)", () => {
    const b = blocosDaReceita("1- DIPIRONA 1G ---- 1CX\nTOMAR 1 CP 6/6H\n2- CETOPROFENO 100MG ----\nTOMAR 1 CP 12/12H\n3- OMEPRAZOL 20MG\nTOMAR 1 CP EM JEJUM");
    const it = itens(b);
    expect(it.map((i) => i.nome)).toEqual(["DIPIRONA 1G", "CETOPROFENO 100MG", "OMEPRAZOL 20MG"]);
    expect(it.map((i) => i.posologia)).toEqual([["TOMAR 1 CP 6/6H"], ["TOMAR 1 CP 12/12H"], ["TOMAR 1 CP EM JEJUM"]]);
    expect(numerosDosItens(b!)).toEqual([1, 2, 3]);
  });

  test("número digitado é mantido; sem número segue a contagem", () => {
    const b = blocosDaReceita("3- DIPIRONA 1G ---- 1CX\nCETOPROFENO 100MG ---- 1CX\n7) INSIT 50MG ---- 1CX\nOMEPRAZOL 20MG ---- 1CX");
    expect(numerosDosItens(b!)).toEqual([3, 4, 7, 8]);
  });

  test("posologia com tracejado fica dentro do remédio", () => {
    const b = blocosDaReceita("DIPIRONA 1G ---- 1CX\nTOMAR 1 CP DE 8/8H ---- SE DOR\n12/12H ---- 7 DIAS\nAplicar no local.... 3x ao dia");
    const it = itens(b);
    expect(it).toHaveLength(1);
    expect(it[0].posologia).toEqual(["TOMAR 1 CP DE 8/8H ---- SE DOR", "12/12H ---- 7 DIAS", "Aplicar no local.... 3x ao dia"]);
  });

  test("linha em branco depois da posologia fecha o item: orientação final não é recuada", () => {
    const b = blocosDaReceita("USO ORAL\n1- DIPIRONA 1G ---- 1CX\nTOMAR 1 CP 6/6H\n\nRecomendo repouso relativo.\nOrientações: retorno em 30 dias");
    expect(itens(b)[0].posologia).toEqual(["TOMAR 1 CP 6/6H"]);
    expect(b![b!.length - 1]).toEqual({ tipo: "texto", linhas: ["Recomendo repouso relativo.", "Orientações: retorno em 30 dias"] });
  });

  test("orientação logo abaixo da posologia, sem linha em branco, também não é posologia", () => {
    const b = blocosDaReceita("DIPIRONA 1G ---- 1CX\nTOMAR 1 CP 6/6H\nOrientações: retorno em 30 dias");
    expect(itens(b)[0].posologia).toEqual(["TOMAR 1 CP 6/6H"]);
    expect(b![b!.length - 1]).toEqual({ tipo: "texto", linhas: ["Orientações: retorno em 30 dias"] });
  });

  test("'Uso contínuo' não vira título de grupo; 'USO TÓPICO' vira", () => {
    const b = blocosDaReceita("LOSARTANA 50MG ---- 1CX\nTOMAR 1 CP AO DIA\n\nUso contínuo\n\nUSO TÓPICO\nDICLOFENACO GEL ---- 1 BISNAGA");
    expect(b!.filter((x) => x.tipo === "via")).toEqual([{ tipo: "via", texto: "USO TÓPICO" }]);
    expect(b!.some((x) => x.tipo === "texto" && x.linhas.includes("Uso contínuo"))).toBe(true);
  });

  test("lista mista: quantidades de qualquer jeito, 3 itens com a posologia de cada um", () => {
    const b = blocosDaReceita("CELECOXIBE 200MG ---- 1CX\nTOMAR 1 CP DE 12/12H\nGABAPENTINA 300MG ---- 60 CP/MÊS\nTOMAR 1 CP A NOITE\nMELOXICAM 15MG ---- QSP 30 DIAS\nTOMAR 1 CP AO DIA");
    const it = itens(b);
    expect(it.map((i) => [i.nome, i.qtd, i.posologia])).toEqual([
      ["CELECOXIBE 200MG", "1CX", ["TOMAR 1 CP DE 12/12H"]],
      ["GABAPENTINA 300MG", "60 CP/MÊS", ["TOMAR 1 CP A NOITE"]],
      ["MELOXICAM 15MG", "QSP 30 DIAS", ["TOMAR 1 CP AO DIA"]],
    ]);
  });

  test("'USO ORAL ----------' (via seguida só de tracejado) vira título de grupo", () => {
    const b = blocosDaReceita("USO ORAL ----------\nCELECOXIBE 200MG ---- 1CX\nTOMAR 1 CP");
    expect(b![0]).toEqual({ tipo: "via", texto: "USO ORAL" });
    expect(itens(b)).toHaveLength(1);
  });

  test("texto sem nenhum remédio: devolve null (a folha mostra o texto como sempre)", () => {
    expect(blocosDaReceita("Repouso por 3 dias.\nCompressa fria 3x ao dia.")).toBeNull();
    expect(blocosDaReceita("TOMAR 1 CP DE 8/8H ---- SE DOR")).toBeNull();
    expect(blocosDaReceita("")).toBeNull();
  });

  test("texto com \\r\\n (Windows) funciona igual", () => {
    const b = blocosDaReceita("USO ORAL\r\n\r\nCIBEX 200MG ------------ 1CX\r\n\r\nTOMAR 1 CP DE 12 EM 12H.");
    expect(itens(b)[0]).toMatchObject({ nome: "CIBEX 200MG", qtd: "1CX", posologia: ["TOMAR 1 CP DE 12 EM 12H."] });
  });
});
