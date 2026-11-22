import { montarLinhas, podeUsar, dadosAceitos, escolher, iguais, cpfValido, corrigir, desconferir, dataDigitada } from "@/lib/conferirLeitura";

// Dados 100% fictícios.
const CPF_OK = "52998224725";
const CPF_OUTRO_OK = "11144477735";

describe("Confira a leitura (app do celular)", () => {
  test("cadastro vazio: entra (amarelo, já aceito) nos campos comuns", () => {
    const l = montarLinhas({ cadastro: { name: "FULANO FICTICIO" }, leituras: { identity: { campos: { rg: "1234567 SSP/PB" } } } })
      .filter((x) => x.campo === "rg");
    expect(l[0].cor).toBe("amarelo");
    expect(podeUsar(l)).toBe(true);
    expect(dadosAceitos(l)).toEqual({ rg: "1234567 SSP/PB" });
  });

  test("CPF e nascimento amarelos NÃO entram sozinhos: exigem Conferi", () => {
    let l = montarLinhas({ cadastro: { cpf: null }, leituras: { identity: { campos: { cpf: CPF_OK, birthdate: "1980-05-17" } } } })
      .filter((x) => x.campo === "cpf" || x.campo === "birthdate");
    expect(l.every((x) => x.cor === "amarelo" && x.conferir && x.escolha === null)).toBe(true);
    expect(podeUsar(l)).toBe(false);
    expect(dadosAceitos(l)).toEqual({});
    l = escolher(l, "cpf", "foto");          // marcou "Conferi"
    l = escolher(l, "birthdate", "manter");  // deixou vazio
    expect(podeUsar(l)).toBe(true);
    expect(dadosAceitos(l)).toEqual({ cpf: CPF_OK });
    l = desconferir(l, "cpf");
    expect(podeUsar(l)).toBe(false);
  });

  test("corrigir o valor conta como conferido (se válido)", () => {
    let l = montarLinhas({ cadastro: {}, leituras: { identity: { campos: { birthdate: "1980-05-17", cpf: CPF_OK } } } })
      .filter((x) => x.campo === "cpf" || x.campo === "birthdate");
    l = corrigir(l, "birthdate", "18/05/1980");
    l = corrigir(l, "cpf", "52998224726");   // dígito errado: continua sem decidir
    expect(l.find((x) => x.campo === "cpf")!.escolha).toBeNull();
    expect(podeUsar(l)).toBe(false);
    l = corrigir(l, "cpf", "111.444.777-35");
    expect(podeUsar(l)).toBe(true);
    expect(dadosAceitos(l)).toEqual({ birthdate: "1980-05-18", cpf: "11144477735" });
    expect(dataDigitada("30/02/1980")).toBeNull();
    expect(dataDigitada("01/01/1899")).toBeNull();
  });

  test("amarelo desmarcado não entra", () => {
    let l = montarLinhas({ cadastro: {}, leituras: { identity: { campos: { rg: "123456" } } } });
    l = escolher(l, "rg", "manter");
    expect(dadosAceitos(l)).toEqual({});
  });

  test("igual: verde e não entra", () => {
    const l = montarLinhas({ cadastro: { cpf: "529.982.247-25", name: "Fulano Fictício" },
      leituras: { identity: { campos: { cpf: CPF_OK, name: "FULANO FICTICIO" } } } });
    expect(l.filter((x) => ["cpf", "name"].includes(x.campo)).every((x) => x.cor === "verde")).toBe(true);
    expect(dadosAceitos(l)).toEqual({});
  });

  test("diferente sem escolha deixa o botão apagado; com escolha entra", () => {
    let l = montarLinhas({ cadastro: { insurance_number: "999999" }, leituras: { insurance_card: { campos: { insurance_number: "123456789" } } } }).filter((x) => x.campo === "insurance_number");
    expect(l[0].cor).toBe("laranja");
    expect(podeUsar(l)).toBe(false);
    l = escolher(l, "insurance_number", "foto");
    expect(podeUsar(l)).toBe(true);
    expect(dadosAceitos(l)).toEqual({ insurance_number: "123456789" });
    l = escolher(l, "insurance_number", "manter");
    expect(dadosAceitos(l)).toEqual({});
  });

  test("CPF com dígito errado fica cinza e não entra", () => {
    const l = montarLinhas({ cadastro: {}, leituras: { identity: { campos: { cpf: "52998224726" } } } }).filter((x) => x.campo === "cpf");
    expect(l[0].cor).toBe("cinza");
    expect(dadosAceitos(l)).toEqual({});
    expect(cpfValido("52998224726")).toBe(false);
  });

  test("não leu: cinza com o motivo do servidor", () => {
    const l = montarLinhas({ cadastro: {}, leituras: { insurance_card: { campos: { cpf: null }, motivos: { cpf: "CPF do titular ou responsável" } } } });
    const cpf = l.find((x) => x.campo === "cpf")!;
    expect(cpf.cor).toBe("cinza");
    expect(cpf.motivo).toBe("CPF do titular ou responsável");
  });

  test("CPF que já é de outro paciente: laranja travado, não entra", () => {
    let l = montarLinhas({ cadastro: {}, leituras: { identity: { campos: { cpf: CPF_OK } } }, cpfsDeOutros: { [CPF_OK]: { id: 9, name: "OUTRO FICTICIO" } } }).filter((x) => x.campo === "cpf");
    expect(l[0].cor).toBe("laranja");
    expect(l[0].travado).toBe(true);
    l = escolher(l, "cpf", "foto");
    expect(dadosAceitos(l)).toEqual({});
    expect(podeUsar(l)).toBe(true);
  });

  test("nome diferente entre documento e carteirinha: avisa e ela escolhe", () => {
    let l = montarLinhas({ cadastro: {}, leituras: {
      identity: { campos: { name: "MARIA FICTICIA" } },
      insurance_card: { campos: { name: "MARIA FICTICIA SOUZA" } },
    } });
    const nome = l.find((x) => x.campo === "name")!;
    expect(nome.cor).toBe("laranja");
    expect(nome.opcoes.map((o) => o.chave)).toEqual(["manter", "identity", "insurance_card"]);
    expect(podeUsar(l)).toBe(false);
    l = escolher(l, "name", "insurance_card");
    expect(dadosAceitos(l)).toEqual({ name: "MARIA FICTICIA SOUZA" });
  });

  test("CPF de outro paciente vem ANTES da escolha e confere os dois documentos", () => {
    // documento e carteirinha discordam; o da CARTEIRINHA é de outro paciente
    let l = montarLinhas({ cadastro: {}, leituras: {
      identity: { campos: { cpf: CPF_OUTRO_OK } }, insurance_card: { campos: { cpf: CPF_OK } },
    }, cpfsDeOutros: { [CPF_OK]: { id: 9, name: "OUTRO FICTICIO" } } }).filter((x) => x.campo === "cpf");
    expect(l[0].travado).toBe(true);
    expect(l[0].opcoes.map((o) => o.chave)).toEqual(["manter"]);
    l = escolher(l, "cpf", "insurance_card");
    expect(dadosAceitos(l)).toEqual({});
  });

  test("documentos discordam e cadastro vazio: oferece Deixar vazio", () => {
    let l = montarLinhas({ cadastro: {}, leituras: {
      identity: { campos: { birthdate: "1980-05-17" } }, insurance_card: { campos: { birthdate: "1980-05-18" } },
    } }).filter((x) => x.campo === "birthdate");
    expect(l[0].opcoes.map((o) => o.rotulo)).toEqual(["Deixar vazio", "Do documento", "Da carteirinha"]);
    l = escolher(l, "birthdate", "manter");
    expect(podeUsar(l)).toBe(true);
    expect(dadosAceitos(l)).toEqual({});
  });

  test("mesmo CPF nos dois documentos não vira conflito", () => {
    const l = montarLinhas({ cadastro: {}, leituras: { identity: { campos: { cpf: CPF_OK } }, insurance_card: { campos: { cpf: "529.982.247-25" } } } });
    expect(l.find((x) => x.campo === "cpf")!.cor).toBe("amarelo");
    expect(CPF_OUTRO_OK).toHaveLength(11);
  });

  test('"UNIMED CAMPINA GRANDE" × "Unimed" é verde', () => {
    expect(iguais("insurance", "UNIMED CAMPINA GRANDE", "Unimed")).toBe(true);
    const l = montarLinhas({ cadastro: { insurance: "Unimed" }, leituras: { insurance_card: { campos: { insurance: "UNIMED CAMPINA GRANDE" } } } }).filter((x) => x.campo === "insurance");
    expect(l[0].cor).toBe("verde");
    expect(iguais("insurance", "Bradesco Saúde", "Unimed")).toBe(false);
  });

  test("documento não fotografado não aparece", () => {
    const l = montarLinhas({ cadastro: {}, leituras: { identity: { campos: {} } } });
    expect(l.find((x) => x.campo === "insurance")).toBeUndefined();
  });
});
