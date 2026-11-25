import { baixarPaginasDaGuia, filaComLimite, PAGINAS_POR_PEDIDO } from "@/lib/paginasPdf";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  api: { get: jest.fn() },
}));

const get = api.get as jest.Mock;

beforeEach(() => {
  get.mockReset();
});

describe("páginas da guia em lotes", () => {
  test("pede de 5 em 5 até cobrir o total e não dispara os lotes juntos", async () => {
    const emVoo: Array<() => void> = [];
    get.mockImplementation((_url: string, cfg: { params: { offset: number } }) => {
      const offset = cfg.params.offset;
      return new Promise((resolve) => {
        emVoo.push(() => {
          const paginas = offset === 0 ? ["p0", "p1", "p2", "p3", "p4"] : ["p5", "p6"];
          resolve({
            data: { paginas, total: 7, largura_mm: 297, altura_mm: 210 },
          });
        });
      });
    });

    const pedido = baixarPaginasDaGuia(9, 44);
    await Promise.resolve();
    expect(emVoo).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe("/patients/9/documents/44/paginas");
    expect(get.mock.calls[0][1].params).toEqual({ offset: 0, limite: PAGINAS_POR_PEDIDO });
    expect(get.mock.calls[0][1].timeout).toBe(60_000);

    emVoo.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1].params.offset).toBe(5);

    emVoo.shift()!();
    await expect(pedido).resolves.toEqual({
      imgs: ["p0", "p1", "p2", "p3", "p4", "p5", "p6"],
      deitada: true,
    });
  });

  test("painel fechado no meio não devolve folha pela metade", async () => {
    get.mockResolvedValue({ data: { paginas: ["p0"], total: 6, largura_mm: 210, altura_mm: 297 } });
    const sinal = { cancelado: true };
    await expect(baixarPaginasDaGuia(1, 2, sinal)).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  test("no máximo 2 trabalhos ao mesmo tempo", async () => {
    const fila = filaComLimite(2);
    let ativos = 0;
    let pico = 0;
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await Promise.all(
      Array.from({ length: 6 }, () =>
        fila(async () => {
          ativos += 1;
          pico = Math.max(pico, ativos);
          await espera(20);
          ativos -= 1;
        }),
      ),
    );
    expect(pico).toBe(2);
  });
});
