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

  test("logotipo do app: favicons, cor do topo, nome do app e barra do iPhone", () => {
    const h = ler("celular.html");
    expect(h).toContain("/icons/favicon-32.png");
    expect(h).toContain("/icons/favicon-48.png");
    expect(h).toMatch(/name="theme-color" content="#12294E"/);
    expect(h).toContain('name="application-name" content="OrthoMedic"');
    expect(h).toContain('name="apple-mobile-web-app-title" content="OrthoMedic"');
    expect(h).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    // o site do PC segue com o ícone e a cor dele
    expect(ler("painel.html")).not.toContain("/icons/favicon-32.png");
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
    for (const f of ["celular/agenda.html", "celular/sala.html", "celular/paciente.html"]) {
      if (fs.existsSync(path.join(__dirname, "..", "..", "app", f.replace(".html", ""), "page.tsx"))) expect(fs.existsSync(path.join(out, f))).toBe(true);
    }
  });
});
