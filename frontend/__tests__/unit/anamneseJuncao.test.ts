// Revisão 19/11 (vigia, item 1): acréscimo feito por fora não pode ser apagado
// pelo autosave seguinte depois do 409. Testa a junção e o fluxo, sem rede.
import { juntarAnamnese, folhaDepoisDaJuncao } from "@/lib/anamneseJuncao";

describe("juntarAnamnese", () => {
  it("mantém o texto do servidor e acrescenta só as linhas novas da tela", () => {
    expect(juntarAnamnese("a\nX", "a", "a\nb")).toBe("a\nX\nb");
  });
  it("sem linha nova devolve o servidor", () => {
    expect(juntarAnamnese("a\nX", "a", "a")).toBe("a\nX");
  });
});

describe("folhaDepoisDaJuncao", () => {
  it("sem digitação no meio: a tela vira a folha do servidor, guardando o espaço do fim", () => {
    expect(folhaDepoisDaJuncao("── d ──\na\nX\nb", "── d ──\na\nb ", "── d ──\na\nb ")).toBe("── d ──\na\nX\nb ");
    expect(folhaDepoisDaJuncao("── d ──\na\nX\nb", "── d ──\na\nb\n", "── d ──\na\nb\n")).toBe("── d ──\na\nX\nb\n");
  });
  it("digitou enquanto salvava: não perde o que digitou nem o acréscimo de fora", () => {
    const r = folhaDepoisDaJuncao("── d ──\na\nX\nb", "── d ──\na\nb", "── d ──\na\nb\nc");
    expect(r).toContain("X");
    expect(r.endsWith("c")).toBe(true);
  });
});

describe("fluxo do 409 com servidor simulado", () => {
  // servidor com trava de base_content, como evolutionApi.update
  function criarServidor(inicial: string) {
    let content = inicial;
    return {
      get: () => content,
      addPorFora: (linha: string) => { content = `${content}\n${linha}`; },
      update: (novo: string, base: string) => {
        if (base !== content) return { status: 409, content_atual: content };
        content = novo;
        return { status: 200 };
      },
    };
  }

  // um save da tela: igual ao salvarFolhaDeVerdade (1 bloco), com a correção
  function salvar(srv: ReturnType<typeof criarServidor>, tela: string, ref: { raw: string }) {
    let juntou = false;
    const r = srv.update(tela, ref.raw);
    if (r.status === 409) {
      const atual = r.content_atual!;
      const juntado = juntarAnamnese(atual, ref.raw, tela);
      if (juntado !== atual) srv.update(juntado, atual);
      juntou = true;
    }
    ref.raw = srv.get(); // recarrega do servidor
    return juntou ? folhaDepoisDaJuncao(srv.get(), tela, tela) : tela;
  }

  it("o acréscimo de fora sobrevive ao autosave seguinte", () => {
    const srv = criarServidor("dor no joelho");
    const ref = { raw: srv.get() };
    let tela = "dor no joelho\npiora ao subir escada";
    srv.addPorFora("RX pedido");                 // anamnese_add
    tela = salvar(srv, tela, ref);              // 409 + junção
    expect(tela).toContain("RX pedido");        // a tela redesenhou
    tela = tela + "\nsem trauma";               // ele continua digitando
    salvar(srv, tela, ref);                     // autosave seguinte
    expect(srv.get()).toContain("RX pedido");
    expect(srv.get()).toContain("piora ao subir escada");
    expect(srv.get()).toContain("sem trauma");
  });

  it("sem a correção (tela antiga) o autosave seguinte apagaria — prova do bug", () => {
    const srv = criarServidor("dor no joelho");
    const ref = { raw: srv.get() };
    const tela = "dor no joelho\npiora";
    srv.addPorFora("RX pedido");
    salvar(srv, tela, ref);
    srv.update(tela + "\nsem trauma", ref.raw); // tela antiga, base já atualizada
    expect(srv.get()).not.toContain("RX pedido");
  });
});
