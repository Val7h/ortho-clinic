"use client";
import Link from "next/link";

function OrthoIcon() {
  // Logomarca OrthoClinic "Articulacao" (Opcao 2 aprovada pelo Dr. Valth):
  // o "O" de Ortho como articulacao bola-e-soquete.
  return (
    <svg width="32" height="32" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="ocg-priv" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0F2D5E" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#ocg-priv)" />
      <path d="M50 18 a32 32 0 1 0 32 32" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
      <circle cx="63" cy="37" r="14" fill="#22d3ee" />
      <circle cx="58" cy="32" r="4" fill="#fff" opacity="0.85" />
    </svg>
  );
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
            <span className="text-white"><OrthoIcon /></span>
          </div>
          <span className="font-extrabold text-white text-sm">OrthoClinic</span>
          <span className="text-white/40 mx-2">·</span>
          <span className="text-white/80 text-sm">Política de Privacidade</span>
          <div className="ml-auto flex gap-3 text-xs text-white/60">
            <Link href="/termos" className="hover:text-white">Termos de Uso</Link>
            <Link href="/contrato" className="hover:text-white">Contrato</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-8 py-8 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Versão 1.0 · Vigência a partir de 01/07/2026</p>
            <h1 className="text-2xl font-extrabold text-slate-900">Política de Privacidade — OrthoClinic</h1>
            <p className="text-slate-500 mt-2 text-sm">
              Em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018),
              especialmente o Art. 11 (dados pessoais sensíveis de saúde).
            </p>
          </div>

          <div className="px-8 py-8 text-sm leading-relaxed space-y-8 text-slate-700">

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">1. IDENTIFICAÇÃO DO CONTROLADOR E OPERADOR</h2>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 text-sm">
                <p><strong>Operador dos dados (OrthoClinic):</strong><br />
                OrthoClinic Tecnologia Ltda · CNPJ a ser informado<br />
                Campina Grande/PB · contato@orthoclinic.app</p>
                <p><strong>Controlador dos dados (você, o médico/clínica):</strong><br />
                O profissional de saúde ou pessoa jurídica que utiliza a plataforma e decide
                como os dados dos pacientes são coletados e tratados.</p>
              </div>
              <p className="mt-3">
                A OrthoClinic atua como <strong>operadora</strong> dos dados pessoais dos pacientes,
                tratando-os exclusivamente conforme instruções do médico (controlador) e nos limites
                desta Política.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">2. DADOS QUE COLETAMOS</h2>

              <h3 className="font-semibold text-slate-700 mt-3 mb-2">2.1 Dados do médico/clínica (usuários da plataforma)</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Nome completo, e-mail, telefone, CRM;</li>
                <li>Dados da clínica (nome, endereço, CNPJ);</li>
                <li>Dados de pagamento (processados por plataforma terceira — não armazenamos cartão);</li>
                <li>Logs de acesso (IP, data/hora, ações realizadas).</li>
              </ul>

              <h3 className="font-semibold text-slate-700 mt-4 mb-2">2.2 Dados dos pacientes (dados sensíveis de saúde — Art. 11 LGPD)</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Identificação: nome, CPF, data de nascimento, telefone, e-mail;</li>
                <li>Dados de saúde: prontuário, diagnósticos (CID-10), prescrições, exames, histórico médico;</li>
                <li>Imagens médicas e fotos do paciente (armazenadas no Cloudinary);</li>
                <li>Dados de anamnese preenchidos pelo próprio paciente via link público;</li>
                <li>Número de telefone para envio de mensagens WhatsApp.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">3. BASE LEGAL E FINALIDADE DO TRATAMENTO</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse mt-2">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-3 border border-slate-200 font-semibold">Tipo de dado</th>
                      <th className="text-left p-3 border border-slate-200 font-semibold">Finalidade</th>
                      <th className="text-left p-3 border border-slate-200 font-semibold">Base legal (LGPD)</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    <tr>
                      <td className="p-3 border border-slate-200">Dados do médico</td>
                      <td className="p-3 border border-slate-200">Prestação do serviço, faturamento, suporte</td>
                      <td className="p-3 border border-slate-200">Art. 7º, V — Execução de contrato</td>
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="p-3 border border-slate-200">Prontuário do paciente</td>
                      <td className="p-3 border border-slate-200">Gestão clínica, continuidade de cuidado</td>
                      <td className="p-3 border border-slate-200">Art. 11, II, f — Tutela da saúde</td>
                    </tr>
                    <tr>
                      <td className="p-3 border border-slate-200">Telefone do paciente</td>
                      <td className="p-3 border border-slate-200">Confirmação de consulta, lembretes</td>
                      <td className="p-3 border border-slate-200">Art. 7º, I — Consentimento (capturado pelo médico)</td>
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="p-3 border border-slate-200">Logs de acesso</td>
                      <td className="p-3 border border-slate-200">Segurança, prevenção de fraudes, auditoria</td>
                      <td className="p-3 border border-slate-200">Art. 7º, IX — Legítimo interesse</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">4. COMPARTILHAMENTO E SUBOPERADORES</h2>
              <p>A OrthoClinic utiliza os seguintes suboperadores de dados:</p>
              <div className="mt-3 space-y-2">
                {[
                  { name: "Render (render.com)", role: "Hospedagem do backend e banco de dados PostgreSQL — servidores nos EUA", flag: "🇺🇸" },
                  { name: "Cloudinary (cloudinary.com)", role: "Armazenamento de imagens e arquivos médicos — servidores nos EUA", flag: "🇺🇸" },
                  { name: "Evolution API (local)", role: "Envio de mensagens WhatsApp — processado localmente no servidor do médico", flag: "🇧🇷" },
                  { name: "Cloudflare (cloudflare.com)", role: "CDN e segurança de rede — servidores globais", flag: "🌐" },
                ].map((s) => (
                  <div key={s.name} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-lg">{s.flag}</span>
                    <div>
                      <p className="font-semibold text-slate-800 text-xs">{s.name}</p>
                      <p className="text-slate-500 text-xs">{s.role}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3">
                <strong>Não compartilhamos</strong> dados de pacientes com terceiros para fins publicitários,
                de marketing ou venda. Dados são compartilhados apenas quando exigido por lei ou ordem judicial.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                ⚠️ A transferência internacional de dados para servidores nos EUA é realizada com base
                nas cláusulas contratuais padrão reconhecidas pela ANPD, conforme Art. 33, VI da LGPD.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">5. RETENÇÃO E ELIMINAÇÃO DE DADOS</h2>
              <ul className="list-disc list-inside space-y-2 text-slate-600">
                <li><strong>Durante o contrato ativo:</strong> dados mantidos pelo prazo necessário à prestação do serviço;</li>
                <li><strong>Após encerramento:</strong> dados disponíveis para exportação por 30 dias, depois eliminados dos servidores ativos;</li>
                <li><strong>Backups:</strong> podem persistir em mídias de recuperação por até 90 dias adicionais;</li>
                <li><strong>Prontuários médicos:</strong> o CFM (Resolução 2.217/2018) exige guarda por 20 anos — responsabilidade do médico (controlador) exportar e guardar os dados antes do cancelamento.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">6. SEGURANÇA DOS DADOS</h2>
              <p>Adotamos as seguintes medidas técnicas e organizacionais:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li>Transmissão criptografada via HTTPS/TLS em todos os endpoints;</li>
                <li>Autenticação por token JWT com expiração de 7 dias;</li>
                <li>Controle de acesso por perfis (superadmin, admin, médico, secretária);</li>
                <li>Isolamento de dados entre organizações (multi-tenancy com row-level security);</li>
                <li>Backups diários do banco de dados PostgreSQL (planos Starter em diante).</li>
              </ul>
              <p className="mt-3">
                Em caso de incidente de segurança que possa afetar direitos dos titulares, a OrthoClinic
                notificará o médico (controlador) em até <strong>48 horas</strong> após a ciência do incidente,
                conforme Art. 48 da LGPD.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">7. DIREITOS DOS TITULARES</h2>
              <p>Os pacientes (titulares dos dados) têm os seguintes direitos, exercíveis perante o médico (controlador):</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li><strong>Confirmação e acesso</strong> (Art. 18, I e II): saber se seus dados são tratados e acessá-los;</li>
                <li><strong>Correção</strong> (Art. 18, III): corrigir dados incompletos ou incorretos;</li>
                <li><strong>Anonimização ou eliminação</strong> (Art. 18, IV): quando o tratamento for desnecessário;</li>
                <li><strong>Portabilidade</strong> (Art. 18, V): receber os dados em formato estruturado;</li>
                <li><strong>Revogação do consentimento</strong> (Art. 18, IX): quando aplicável.</li>
              </ul>
              <p className="mt-3">
                Solicitações de titulares devem ser direcionadas ao médico (controlador dos dados).
                A OrthoClinic auxilia o controlador no atendimento, quando tecnicamente possível.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">8. ENCARREGADO DE DADOS (DPO)</h2>
              <p>
                O encarregado de proteção de dados (<em>Data Protection Officer</em>) da OrthoClinic é:
              </p>
              <div className="mt-2 p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                <p><strong>Dr. Valth Menezes Guimarães</strong><br />
                E-mail: <a href="mailto:dpo@orthoclinic.app" className="text-blue-600 hover:underline">dpo@orthoclinic.app</a><br />
                WhatsApp: <a href="https://wa.me/5583999999999" className="text-blue-600 hover:underline">(83) 9 9999-9999</a></p>
              </div>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">9. COOKIES E RASTREAMENTO</h2>
              <p>
                A plataforma utiliza apenas cookies técnicos essenciais para funcionamento
                (autenticação, sessão). Não utilizamos cookies de rastreamento, publicidade
                ou analytics de terceiros.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">10. ALTERAÇÕES DESTA POLÍTICA</h2>
              <p>
                Esta Política pode ser atualizada a qualquer momento. Alterações substanciais serão
                comunicadas com antecedência de <strong>30 dias</strong> por e-mail ou notificação na plataforma.
                O uso continuado após a comunicação implica aceitação das alterações.
              </p>
              <p className="mt-2">
                Esta política foi elaborada em conformidade com a LGPD (Lei 13.709/2018),
                a Resolução CFM 2.217/2018 e as recomendações da ANPD.
              </p>
            </section>

          </div>

          <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Versão 1.0 · Última atualização: julho/2026</p>
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="text-xs px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-colors"
              >
                Imprimir / Salvar PDF
              </button>
              <Link
                href="/termos"
                className="text-xs px-4 py-2 rounded-xl text-white font-semibold"
                style={{ background: "linear-gradient(135deg, #0F2D5E, #2563EB)" }}
              >
                Ver Termos de Uso →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
