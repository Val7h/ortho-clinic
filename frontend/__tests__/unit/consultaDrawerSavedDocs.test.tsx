/**
 * Regressão: em 3 abas diferentes (Laudos, Atestados, Encaminhamentos) o
 * mesmo defeito apareceu ao vivo — o documento era salvo de verdade no banco
 * (reportsApi.create respondia 200) mas a lista de "salvos" na tela nunca
 * refletia isso, porque era buscada só uma vez no mount e o handler de salvar
 * nunca empurrava o novo registro pro estado local. Valth só descobria
 * quando precisava reimprimir um documento no meio da consulta e ele não
 * aparecia (Laudos: Maria Ivanice/José Bartolomeu 16-17/09; Encaminhamentos:
 * Jefferson Norte da Silva 17/09; Atestados: mesmo padrão, corrigido
 * preventivamente).
 *
 * Este teste existe pra essa classe de bug não voltar a se repetir: ele
 * salva um documento pela UI de verdade e confere que a lista "salvos"
 * mostra o item retornado pela API, sem precisar desmontar/remontar a aba.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TabLaudos, TabAtestados, TabEncaminhamentos } from "@/app/painel/ConsultaDrawer";
import { reportsApi } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  reportsApi: {
    list: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  api: { post: jest.fn(() => Promise.resolve({ data: {} })) },
  msgErro: (_e: any, fallback: string) => fallback,
}));

jest.mock("react-hot-toast", () => {
  const fn: any = jest.fn();
  fn.success = jest.fn();
  fn.error = jest.fn();
  return { __esModule: true, default: fn };
});

const patient = { id: 346, name: "Júlia Valentina Tibúrcio da Silva", cpf: "" };
const clinic = { city: "Caruaru", state: "PE" };

beforeEach(() => {
  jest.clearAllMocks();
  (reportsApi.list as jest.Mock).mockResolvedValue([]);
  (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
  localStorage.clear();
});

describe("TabLaudos — salvar reflete na lista sem remontar", () => {
  it("aparece em 'Laudos salvos' assim que 'Finalizar e Imprimir' termina", async () => {
    const novoLaudo = { id: 999, title: "Laudo — INSS / Perícia Previdenciária", date: "2026-09-23", report_type: "laudo" };
    (reportsApi.create as jest.Mock).mockResolvedValue(novoLaudo);

    render(<TabLaudos patient={patient} clinic={clinic} />);

    await waitFor(() => expect(reportsApi.list).toHaveBeenCalledWith(346));

    fireEvent.change(screen.getByPlaceholderText(/Escreva o laudo aqui/i), {
      target: { value: "Paciente com gonartrose bilateral, indicação de afastamento." },
    });
    fireEvent.change(screen.getByDisplayValue("— selecionar finalidade —"), {
      target: { value: "INSS / Perícia Previdenciária" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Finalizar e Imprimir/i }));

    await waitFor(() => expect(reportsApi.create).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Laudos salvos deste paciente")).toBeInTheDocument();
    expect(await screen.findByText(novoLaudo.title)).toBeInTheDocument();
  });
});

describe("TabAtestados — salvar reflete na lista sem remontar", () => {
  it("aparece em 'Documentos salvos' assim que 'Salvar' termina", async () => {
    const novoAtestado = { id: 888, title: "Atestado — Afastamento do Trabalho", date: "2026-09-23", report_type: "atestado" };
    (reportsApi.create as jest.Mock).mockResolvedValue(novoAtestado);

    render(<TabAtestados patient={patient} clinic={clinic} />);

    await waitFor(() => expect(reportsApi.list).toHaveBeenCalledWith(346));

    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));

    await waitFor(() => expect(reportsApi.create).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Documentos salvos deste paciente")).toBeInTheDocument();
    expect(await screen.findByText(novoAtestado.title)).toBeInTheDocument();
  });
});

describe("TabEncaminhamentos — persistência real + lista reflete sem remontar", () => {
  it("chama reportsApi.create (aba não tinha ISSO antes) e mostra na lista", async () => {
    const novoEncaminhamento = { id: 777, title: "Encaminhamento — Fisioterapia", date: "2026-09-23", report_type: "encaminhamento" };
    (reportsApi.create as jest.Mock).mockResolvedValue(novoEncaminhamento);

    render(<TabEncaminhamentos patient={patient} clinic={clinic} patientId={346} />);

    await waitFor(() => expect(reportsApi.list).toHaveBeenCalledWith(346));

    fireEvent.change(screen.getByPlaceholderText(/Resumo clínico/i), {
      target: { value: "Resumo clínico:\nPaciente com dor lombar.\n\nConduta solicitada:\nFisioterapia motora." },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));

    await waitFor(() => expect(reportsApi.create).toHaveBeenCalledTimes(1));
    expect(reportsApi.create).toHaveBeenCalledWith(
      346,
      expect.objectContaining({ report_type: "encaminhamento" })
    );
    expect(await screen.findByText("Encaminhamentos salvos deste paciente")).toBeInTheDocument();
    expect(await screen.findByText(novoEncaminhamento.title)).toBeInTheDocument();
  });
});
