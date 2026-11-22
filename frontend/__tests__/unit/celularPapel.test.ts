import { cartoesDoInicio, secoesDaFicha, ehMedico } from "@/lib/celularPapel";
import { hojeBR, erroCelular } from "@/lib/celular";

describe("App do celular: médico × secretária", () => {
  test("secretária não vê anamnese nem Gravar", () => {
    const s = secoesDaFicha("secretary");
    expect(s).not.toContain("anamneses");
    expect(s).not.toContain("gravar");
    expect(s).not.toContain("alergias");
    expect(s).toEqual(["cadastro", "pastas"]);
    expect(cartoesDoInicio("secretary").map((c) => c.teste)).toEqual(["cartao-foto", "cartao-agenda", "cartao-sala"]);
  });

  test("médico vê alergias, anamneses, documentos e Gravar", () => {
    for (const papel of ["doctor", "admin", "superadmin"]) {
      expect(ehMedico(papel)).toBe(true);
      expect(secoesDaFicha(papel)).toEqual(["cadastro", "alergias", "anamneses", "documentos", "gravar"]);
      expect(cartoesDoInicio(papel).some((c) => c.href === "/escriba-gravar")).toBe(true);
    }
  });

  test("papel desconhecido ou vazio = como secretária", () => {
    expect(secoesDaFicha(undefined)).toEqual(["cadastro", "pastas"]);
    expect(cartoesDoInicio(null).some((c) => c.teste === "cartao-gravar")).toBe(false);
  });

  test("paciente do ?pid= segue para a foto", () => {
    expect(cartoesDoInicio("secretary", 42)[0].href).toBe("/celular/foto?pid=42");
  });

  test("hoje no horário do Brasil", () => {
    expect(hojeBR(new Date("2026-11-23T02:30:00Z"))).toBe("2026-11-22");
  });

  test("erro sem resposta do servidor sai em português", () => {
    expect(erroCelular({ message: "Network Error" })).toBe("Sem conexão. Tente de novo.");
    expect(erroCelular({ response: { data: { detail: "Este CPF já é de outro paciente (X)." } } })).toContain("outro paciente");
  });
});
