"use client";
import Link from "next/link";

function OrthoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6a3 3 0 0 0-3-3 3 3 0 0 0-2.1 5.1L6.1 14.9A3 3 0 0 0 3 17a3 3 0 0 0 3 3 3 3 0 0 0 2.1-5.1l6.8-6.8A3 3 0 0 0 18 6z"/>
    </svg>
  );
}

function Blank({ label, width = "w-48" }: { label: string; width?: string }) {
  return (
    <span className={`inline-block ${width} border-b-2 border-amber-400 bg-amber-50 px-2 text-amber-800 font-semibold text-xs rounded mx-1`}>
      {label}
    </span>
  );
}

export default function ContratoPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
            <span className="text-white"><OrthoIcon /></span>
          </div>
          <span className="font-extrabold text-white text-sm">OrthoClinic</span>
          <span className="text-white/40 mx-2">·</span>
          <span className="text-white/80 text-sm">Modelo de Contrato SaaS B2B</span>
          <div className="ml-auto flex gap-3 text-xs text-white/60">
            <Link href="/termos" className="hover:text-white">Termos</Link>
            <Link href="/privacidade" className="hover:text-white">Privacidade</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">

        {/* Aviso */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-bold text-amber-900 text-sm">Este é um modelo — preencha os campos em amarelo antes de assinar</p>
            <p className="text-amber-700 text-xs mt-1">
              Campos marcados em amarelo devem ser preenchidos com os dados reais das partes.
              Recomendamos revisão por advogado antes da assinatura com o primeiro cliente externo.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-8 py-8 border-b border-slate-100 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Contrato de Prestação de Serviços</p>
            <h1 className="text-xl font-extrabold text-slate-900">CONTRATO DE LICENÇA DE USO DE SOFTWARE E PRESTAÇÃO DE SERVIÇOS</h1>
            <p className="text-slate-500 text-sm mt-2">Plataforma OrthoClinic — SaaS de Gestão Médica</p>
          </div>

          <div className="px-8 py-8 text-sm leading-relaxed space-y-8 text-slate-700">

            {/* PREÂMBULO */}
            <section>
              <h2 className="text-base font-bold text-slate-800 mb-4">QUALIFICAÇÃO DAS PARTES</h2>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="font-bold text-slate-800 text-xs uppercase tracking-wide mb-2">CONTRATADA</p>
                  <p>
                    <strong>OrthoClinic Tecnologia Ltda</strong>, pessoa jurídica de direito privado,
                    CNPJ n.º <Blank label="XX.XXX.XXX/0001-XX" width="w-44" />,
                    com sede na <Blank label="Endereço completo" width="w-56" />,
                    Campina Grande/PB, CEP <Blank label="XXXXX-XXX" width="w-28" />,
                    representada por seu sócio-administrador
                    <strong> Dr. Valth Menezes Guimarães</strong>, médico ortopedista, CRM-PB <Blank label="XXXXX" width="w-20" />,
                    CPF n.º <Blank label="XXX.XXX.XXX-XX" width="w-36" />,
                    doravante denominada simplesmente <strong>"CONTRATADA"</strong>.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="font-bold text-slate-800 text-xs uppercase tracking-wide mb-2">CONTRATANTE</p>
                  <p>
                    <Blank label="Nome completo / Razão Social" width="w-64" />,
                    <Blank label="CPF/CNPJ" width="w-44" />,
                    <Blank label="médico(a) / pessoa jurídica" width="w-40" />,
                    CRM n.º <Blank label="XXXXX/UF" width="w-24" /> (se pessoa física),
                    com endereço em <Blank label="Endereço completo" width="w-56" />,
                    doravante denominado simplesmente <strong>"CONTRATANTE"</strong>.
                  </p>
                </div>
              </div>
              <p className="mt-4">
                As partes acima qualificadas celebram o presente Contrato de Licença de Uso de Software e
                Prestação de Serviços ("Contrato"), que se rege pelas cláusulas a seguir.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 1ª — OBJETO</h2>
              <p>
                O presente Contrato tem por objeto a concessão, pela CONTRATADA ao CONTRATANTE, de
                <strong> licença de uso não exclusiva, intransferível e por prazo determinado</strong> da
                plataforma de software OrthoClinic, no plano <Blank label="STARTER / PRO / PREMIUM" width="w-44" />,
                com as funcionalidades descritas na página de planos vigente na data da assinatura.
              </p>
              <p className="mt-2">
                A plataforma constitui ferramenta de <strong>gestão administrativa médica</strong>.
                A CONTRATADA não é responsável por decisões clínicas, diagnósticos ou prescrições
                realizados pelo CONTRATANTE por meio da plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 2ª — VIGÊNCIA E RENOVAÇÃO</h2>
              <p>
                O presente Contrato vigorará por <strong>12 (doze) meses</strong>, a partir de
                <Blank label="DD/MM/AAAA" width="w-36" />, renovando-se automaticamente por iguais períodos,
                salvo comunicação contrária de qualquer das partes com antecedência mínima de
                <strong> 30 (trinta) dias</strong>.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 3ª — VALOR E CONDIÇÕES DE PAGAMENTO</h2>
              <p>
                Pela licença objeto deste Contrato, o CONTRATANTE pagará à CONTRATADA o valor mensal de
                <strong> R$ <Blank label="197,00 / 297,00 / 397,00" width="w-44" /></strong> (reais),
                com vencimento todo dia <strong>5 (cinco)</strong> de cada mês.
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li>Forma de pagamento: Pix, cartão de crédito ou boleto bancário;</li>
                <li>Inadimplência superior a <strong>15 dias</strong>: suspensão do acesso sem exclusão de dados;</li>
                <li>Inadimplência superior a <strong>30 dias</strong>: rescisão automática e início do prazo de 30 dias para exportação de dados;</li>
                <li>Reajuste anual pelo <strong>IGPM</strong> do período, com comunicação prévia de 30 dias.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 4ª — OBRIGAÇÕES DA CONTRATADA</h2>
              <p>Incumbe à CONTRATADA:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li>Disponibilizar a plataforma com esforços razoáveis de disponibilidade (best effort; sem SLA de uptime garantido no plano Starter);</li>
                <li>Realizar backup diário dos dados do CONTRATANTE (disponível a partir do plano Starter com banco PostgreSQL no Render);</li>
                <li>Prestar suporte técnico via WhatsApp em dias úteis, das 8h às 18h (horário de Brasília);</li>
                <li>Notificar o CONTRATANTE sobre manutenções programadas com antecedência mínima de 48 horas;</li>
                <li>Tratar os dados dos pacientes do CONTRATANTE exclusivamente conforme instruções deste e nos termos da Política de Privacidade.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 5ª — OBRIGAÇÕES DO CONTRATANTE</h2>
              <p>Incumbe ao CONTRATANTE:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li>Manter seus dados de acesso em sigilo, sendo responsável por todos os acessos realizados com suas credenciais;</li>
                <li>Utilizar a plataforma em conformidade com a legislação aplicável, incluindo CFM, CFO, LGPD e demais normas regulatórias;</li>
                <li>Obter o consentimento livre, informado e inequívoco de seus pacientes para o tratamento de dados pessoais de saúde;</li>
                <li>Notificar a CONTRATADA, em até 24 horas, sobre qualquer suspeita de acesso não autorizado à conta;</li>
                <li>Manter, sob sua responsabilidade exclusiva, cópia dos prontuários eletrônicos pelo prazo mínimo exigido pelo CFM (20 anos);</li>
                <li>Efetuar os pagamentos nas datas convencionadas.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 6ª — LIMITAÇÃO DE RESPONSABILIDADE</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                <p className="font-bold text-amber-900 text-xs uppercase tracking-wide">Cláusula de maior importância jurídica — revise com atenção</p>
              </div>
              <p>
                <strong>6.1.</strong> A CONTRATADA <u>não se responsabiliza</u>, em nenhuma hipótese, por:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li>Erros médicos, diagnósticos incorretos ou decisões clínicas inadequadas do CONTRATANTE;</li>
                <li>Danos causados por dados incorretos ou incompletos inseridos pelo CONTRATANTE na plataforma;</li>
                <li>Indisponibilidade da plataforma por falhas de terceiros (Render, Cloudflare, operadoras de internet, fornecedoras de energia);</li>
                <li>Perda de dados por eventos de força maior, ataques cibernéticos externos ou falha imprevisível de hardware;</li>
                <li>Danos indiretos, lucros cessantes ou danos emergentes resultantes do uso ou impossibilidade de uso da plataforma.</li>
              </ul>
              <p className="mt-3">
                <strong>6.2.</strong> A responsabilidade total da CONTRATADA, em qualquer hipótese de dano comprovado e diretamente atribuível
                à plataforma, limita-se ao <strong>valor efetivamente pago pelo CONTRATANTE nos 12 (doze) meses anteriores</strong> ao
                evento danoso.
              </p>
              <p className="mt-3">
                <strong>6.3.</strong> O CONTRATANTE, como único responsável pelo exercício da medicina e pelas decisões clínicas,
                isenta expressamente a CONTRATADA de qualquer responsabilidade por ações, processos administrativos ou judiciais
                movidos por pacientes ou terceiros em razão de ato médico praticado com o auxílio da plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 7ª — PROPRIEDADE INTELECTUAL</h2>
              <p>
                O software OrthoClinic, incluindo código-fonte, interface, marca, logotipo e documentação,
                é de propriedade exclusiva da CONTRATADA. O presente Contrato concede ao CONTRATANTE
                apenas uma licença de uso, não transferindo qualquer direito de propriedade intelectual.
              </p>
              <p className="mt-2">
                Os dados dos pacientes inseridos pelo CONTRATANTE são de sua propriedade exclusiva.
                A CONTRATADA não adquire qualquer direito sobre esses dados.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 8ª — PROTEÇÃO DE DADOS (DPA)</h2>
              <p>
                <strong>8.1 Papéis:</strong> O CONTRATANTE é o <em>controlador</em> dos dados pessoais
                de seus pacientes. A CONTRATADA é a <em>operadora</em>, tratando os dados exclusivamente
                conforme instruções do controlador e para a finalidade de prestação dos serviços contratados.
              </p>
              <p className="mt-2">
                <strong>8.2 Suboperadores:</strong> A CONTRATADA poderá utilizar os seguintes suboperadores,
                responsabilizando-se contratualmente por sua conformidade com a LGPD: Render (hospedagem),
                Cloudinary (armazenamento de imagens), Evolution API (mensageria WhatsApp).
              </p>
              <p className="mt-2">
                <strong>8.3 Incidentes:</strong> Em caso de incidente de segurança que possa afetar os
                dados dos pacientes, a CONTRATADA notificará o CONTRATANTE em até 48 horas, fornecendo
                informações sobre a natureza, extensão e medidas adotadas.
              </p>
              <p className="mt-2">
                <strong>8.4 Exclusão:</strong> Após o encerramento do Contrato, os dados estarão disponíveis
                para exportação por 30 dias. Após esse prazo, serão permanentemente excluídos dos servidores
                ativos, podendo restar em backups por até 90 dias adicionais.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 9ª — CONFIDENCIALIDADE</h2>
              <p>
                Ambas as partes se obrigam a manter em absoluto sigilo todas as informações confidenciais
                a que tenham acesso em razão deste Contrato, incluindo dados de pacientes, código-fonte,
                estratégias comerciais e dados financeiros. Esta obrigação subsiste por 5 anos após o
                encerramento do Contrato.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 10ª — RESCISÃO</h2>
              <p>O presente Contrato poderá ser rescindido:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li><strong>Por qualquer das partes</strong>, sem justa causa, mediante aviso prévio por escrito de 30 dias;</li>
                <li><strong>Imediatamente pela CONTRATADA</strong>, sem ônus, em caso de inadimplência superior a 30 dias, uso indevido da plataforma ou violação da LGPD pelo CONTRATANTE;</li>
                <li><strong>Imediatamente pelo CONTRATANTE</strong>, sem ônus, em caso de descontinuação definitiva da plataforma pela CONTRATADA.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-800 mb-3">CLÁUSULA 11ª — DISPOSIÇÕES GERAIS</h2>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Este Contrato é regido pela legislação brasileira, em especial o Código Civil, a LGPD e o Marco Civil da Internet;</li>
                <li>Fica eleito o foro da comarca de <strong>Campina Grande/PB</strong>, com renúncia expressa a qualquer outro, por mais privilegiado que seja;</li>
                <li>A assinatura digital deste instrumento é válida nos termos da Lei 14.063/2020;</li>
                <li>Este Contrato representa o acordo integral entre as partes, substituindo quaisquer entendimentos anteriores.</li>
              </ul>
            </section>

            {/* Assinatura */}
            <section className="border-t border-slate-200 pt-6">
              <p className="text-center text-slate-600 mb-8">
                Por estarem assim justas e contratadas, as partes assinam o presente instrumento
                em 2 (duas) vias de igual teor e forma.
              </p>
              <p className="text-center text-slate-500 mb-10">
                Campina Grande/PB, <Blank label="____" width="w-8" /> de <Blank label="___________" width="w-32" /> de 2026.
              </p>
              <div className="grid grid-cols-2 gap-12">
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-2 mt-16">
                    <p className="font-semibold text-slate-800 text-sm">OrthoClinic Tecnologia Ltda</p>
                    <p className="text-xs text-slate-500">Dr. Valth Menezes Guimarães</p>
                    <p className="text-xs text-slate-500">Sócio-Administrador · CONTRATADA</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-2 mt-16">
                    <p className="font-semibold text-slate-800 text-sm"><Blank label="Nome do Contratante" width="w-48" /></p>
                    <p className="text-xs text-slate-500"><Blank label="CRM / CNPJ" width="w-32" /></p>
                    <p className="text-xs text-slate-500">CONTRATANTE</p>
                  </div>
                </div>
              </div>
              <div className="mt-8 text-center">
                <p className="text-xs text-slate-400">Testemunha 1: ________________________ CPF: ___________________</p>
                <p className="text-xs text-slate-400 mt-2">Testemunha 2: ________________________ CPF: ___________________</p>
              </div>
            </section>

          </div>

          <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Modelo v1.0 · Recomendamos revisão por advogado antes da primeira assinatura com cliente externo
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="text-xs px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-colors"
              >
                Imprimir / Baixar PDF
              </button>
              <a
                href="https://wa.me/5583999999999?text=Olá! Quero contratar o OrthoClinic e assinar o contrato."
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-4 py-2 rounded-xl text-white font-semibold"
                style={{ background: "linear-gradient(135deg, #0F2D5E, #2563EB)" }}
              >
                Solicitar via WhatsApp →
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
