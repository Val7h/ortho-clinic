// Build do app do celular (22/11/2026): roda depois do `npm run build`.
import fs from "fs";
import path from "path";

const out = path.join(__dirname, "..", "..", "out");
const ler = (f: string) => fs.readFileSync(path.join(out, f), "utf8");
const temBuild = fs.existsSync(path.join(out, "celular.html"));

(temBuild ? describe : describe.skip)("out/ do app do celular", () => {
  test("celular.html aponta para o manifesto próprio e o ícone 180", () => {
    const h = ler("celular.html");
    expect(h).toContain('rel="manifest" href="/manifest-celular.json"');
    expect(h).toMatch(/rel="apple-touch-icon"[^>]*apple-touch-icon-180\.png|apple-touch-icon-180\.png[^>]*rel="apple-touch-icon"/);
    expect(h).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  test("foto.html existe e o resto do site segue no manifest.json antigo", () => {
    expect(ler("celular/foto.html")).toContain("/manifest-celular.json");
    expect(ler("painel.html")).toContain('rel="manifest" href="/manifest.json"');
  });

  test("manifesto e ícones estão no out/", () => {
    const m = JSON.parse(ler("manifest-celular.json"));
    expect(m).toMatchObject({ id: "/celular", start_url: "/celular", scope: "/", display: "standalone", name: "OrthoMedic" });
    for (const i of m.icons) expect(fs.existsSync(path.join(out, i.src))).toBe(true);
    expect(fs.existsSync(path.join(out, "icons", "apple-touch-icon-180.png"))).toBe(true);
  });
});
