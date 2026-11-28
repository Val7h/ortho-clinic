// Trava de alergia no Finalizar (revisão 28/11/2026): o OK/Enter nunca grava na ficha,
// "adicionar" é explícito e manda só os itens mostrados; msgErro lê detail.msg.
import { api, msgErro, waitingRoomApi } from "@/lib/api";

const erro409 = (alergias: string[]) => ({
  response: { status: 409, data: { detail: { codigo: "ALERGIA_PENDENTE", alergias, msg: "Alergia pendente: " + alergias.join(", ") } } },
});

afterEach(() => jest.restoreAllMocks());

test("msgErro usa detail.msg quando detail é objeto", () => {
  expect(msgErro(erro409(["PLASIL"]))).toBe("Alergia pendente: PLASIL");
});

test("OK na 1ª pergunta finaliza SEM gravar (ignorar) com os itens mostrados", async () => {
  const patch = jest.spyOn(api, "patch")
    .mockRejectedValueOnce(erro409(["PLASIL"]))
    .mockResolvedValueOnce({ data: { id: 1, patient_id: 7, status: "attended" } } as any);
  jest.spyOn(window, "confirm").mockReturnValueOnce(true);
  await waitingRoomApi.updateStatus(1, "attended");
  expect(patch).toHaveBeenLastCalledWith("/api/clinic/waiting-room/1/status",
    { status: "attended", alergias_acao: "ignorar", alergias_itens: ["PLASIL"] });
});

test("adicionar só na 2ª pergunta, explícita, e avisa a gaveta para recarregar o paciente", async () => {
  const patch = jest.spyOn(api, "patch")
    .mockRejectedValueOnce(erro409(["PLASIL"]))
    .mockResolvedValueOnce({ data: { id: 1, patient_id: 7, status: "attended" } } as any);
  jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const ouvido = jest.fn();
  window.addEventListener("ortho:patient-changed", ouvido);
  await waitingRoomApi.updateStatus(1, "attended");
  window.removeEventListener("ortho:patient-changed", ouvido);
  expect(patch).toHaveBeenLastCalledWith("/api/clinic/waiting-room/1/status",
    { status: "attended", alergias_acao: "adicionar", alergias_itens: ["PLASIL"] });
  expect((ouvido.mock.calls[0][0] as CustomEvent).detail).toEqual({ patientId: 7 });
});

test("Cancelar nas duas perguntas não finaliza", async () => {
  const patch = jest.spyOn(api, "patch").mockRejectedValueOnce(erro409(["PLASIL"]));
  jest.spyOn(window, "confirm").mockReturnValue(false);
  await expect(waitingRoomApi.updateStatus(1, "attended")).rejects.toThrow("Alergia pendente: PLASIL");
  expect(patch).toHaveBeenCalledTimes(1);
});
