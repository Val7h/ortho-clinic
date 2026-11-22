import { criarControleDeTentativas } from "@/lib/tentativas";

describe("Leitura atrasada nunca cai no paciente errado", () => {
  test("resposta vale se o paciente é o mesmo e é a última tentativa", () => {
    const c = criarControleDeTentativas();
    c.trocarPaciente(1);
    const t = c.iniciar("identity");
    expect(c.vale(t)).toBe(true);
  });

  test("trocou de paciente no meio da leitura: descarta", () => {
    const c = criarControleDeTentativas();
    c.trocarPaciente(1);
    const t = c.iniciar("identity");
    c.trocarPaciente(2);
    expect(c.vale(t)).toBe(false);
  });

  test("saiu e voltou para o MESMO paciente: a leitura antiga também é descartada", () => {
    const c = criarControleDeTentativas();
    c.trocarPaciente(1);
    const t = c.iniciar("identity");
    c.trocarPaciente(null);
    c.trocarPaciente(1);
    expect(c.vale(t)).toBe(false);
  });

  test("tirou outra foto do mesmo documento: só a última vale", () => {
    const c = criarControleDeTentativas();
    c.trocarPaciente(1);
    const t1 = c.iniciar("insurance_card");
    const t2 = c.iniciar("insurance_card");
    expect(c.vale(t1)).toBe(false);
    expect(c.vale(t2)).toBe(true);
  });

  test("documentos diferentes não se atrapalham", () => {
    const c = criarControleDeTentativas();
    c.trocarPaciente(1);
    const a = c.iniciar("identity");
    const b = c.iniciar("insurance_card");
    expect(c.vale(a) && c.vale(b)).toBe(true);
  });
});
