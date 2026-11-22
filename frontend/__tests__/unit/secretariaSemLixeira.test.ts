// A secretária não vê botão de apagar no site do PC (Valth, 22/11/2026).
import fs from "fs";
import path from "path";

const ler = (f: string) => fs.readFileSync(path.join(__dirname, "..", "..", f), "utf8");

test("Financeiro: lixeira só para médico e 403 vira 'Só o médico pode excluir'", () => {
  const t = ler("app/financeiro/page.tsx");
  expect(t).toMatch(/\{privileged && <button\s+onClick=\{\(\) => handleDelete\(r\.id\)\}/);
  expect(t).toContain('"Só o médico pode excluir"');
  expect(t).toMatch(/const privileged = \['doctor', 'admin', 'superadmin'\]/);
});

test("Paciente: 'Desativar paciente' só para médico e erro do servidor aparece", () => {
  const t = ler("app/pacientes/[id]/page-client.tsx");
  expect(t).toMatch(/\{isDoctor && <div className="flex gap-2 pt-4">\s*<Button\s+onClick=\{handleDelete\}/);
  expect(t).toContain("const { isDoctor } = useAuth();");
  expect(t).toMatch(/await patientsApi\.delete\(pid\);\s*\} catch \(err\) \{\s*toast\.error\(msgErro\(err/);
});
