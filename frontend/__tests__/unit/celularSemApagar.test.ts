// O app do celular não tem nenhum botão nem chamada de apagar (Valth, 22/11/2026).
import fs from "fs";
import path from "path";

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(path.join(dir, e.name)) : /\.(tsx?|jsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []);
}

const raiz = path.join(__dirname, "..", "..");
const fontes = [
  ...arquivos(path.join(raiz, "app", "celular")),
  ...arquivos(path.join(raiz, "components", "celular")),
  path.join(raiz, "lib", "celular.ts"),
  path.join(raiz, "lib", "celularPapel.ts"),
];

describe("App do celular sem apagar", () => {
  test.each(fontes.map((f) => [path.relative(raiz, f), f]))("%s não apaga nada", (_n, f) => {
    const t = fs.readFileSync(f as string, "utf8");
    expect(t).not.toMatch(/\.delete\(|method:\s*["']DELETE["']|\bApagar\b|\bExcluir\b|\bRemover\b/);
  });
});
