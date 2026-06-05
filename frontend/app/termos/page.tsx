import Link from "next/link";
import { Stethoscope } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-blue-900 mb-3 flex items-baseline gap-2">
        <span className="text-blue-400 font-extrabold text-xl">{number}.</span>
        {title}
      </h2>
      <div className="text-slate-700 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Clause({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <p>
      <span className="font-semibold text-slate-800">{number}</span> {children}
    </p>
  );
}

function HighlightBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-900 leading-relaxed">
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="relative overflow-hidden py-16 px-4 text-white text-center"
        style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
      >
        {/* Voltar */}
        <div className="absolute top-5 left-5">
          <Link
            href="/planos"
            className="text-xs text-blue-200 hover:text-white transition-colors font-medium"
          >
            ← Ver planos
          </Link>
        </div>

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">OrthoClinic</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
          Termos de Uso
        </h1>
        <p className="text-blue-200 text-sm mt-1">
          Vigente desde 05 de junho de 2026
        </p>

        {/* Decorativos */}
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
      </header>

      {/* ── Corpo ───────────────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 py-14">

        {/* Introdução */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8 mb-8">
          <p className="text-slate-600 text-sm leading-relaxed">
            O presente instrumento regula as condições gerais de uso da plataforma{" "}
            <strong>OrthoClinic</strong>, disponibilizada em regime de Software como Serviço
            (SaaS), celebrado entre a empresa fornecedora e o Contratante que aceita estes
            termos ao realizar o cadastro ou ao utilizar qualquer funcionalidade do sistema.
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-3">
            A utilização do sistema implica a leitura, compreensão e aceitação integral e
            irrevogável de todas as cláusulas abaixo. Caso o Contratante não concorde com
            qualquer disposição deste instrumento, deverá abster-se de utilizar a plataforma
            e solicitar o encerramento imediato de sua conta.
          </p>
        </div>

        {/* Conteúdo jurídico */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8">

          {/* 1. Das Partes */}
          <Section number="1" title="Das Partes">
            <Clause number="1.1">
              <strong>CONTRATADA</strong> — <strong>OrthoClinic Tecnologia Ltda</strong> (em
              constituição, sob a forma de Sociedade Limitada Unipessoal — SLU), com sede a ser
              registrada na cidade de Campina Grande, Estado da Paraíba, inscrita ou a ser inscrita
              no CNPJ/MF, representada por seu fundador e administrador <strong>Dr. Valth Menezes
              Guimarães</strong> (CRM-PB XXXXX), doravante denominada simplesmente{" "}
              <strong>"OrthoClinic"</strong>.
            </Clause>
            <Clause number="1.2">
              <strong>CONTRATANTE</strong> — Pessoa física ou jurídica, médico ortopedista, clínica,
              consultório ou profissional de saúde que aceita estes Termos de Uso ao realizar o
              cadastro na plataforma ou ao utilizar qualquer funcionalidade do sistema, doravante
              denominado <strong>"Contratante"</strong>.
            </Clause>
            <Clause number="1.3">
              As Partes se reconhecem com plena capacidade civil e técnica para contratar, ficando
              dispensada a assinatura de instrumento físico separado, sendo a aceitação eletrônica
              destes termos equivalente à assinatura, nos termos do art. 10, §2º, da Medida
              Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020.
            </Clause>
          </Section>

          {/* 2. Do Objeto */}
          <Section number="2" title="Do Objeto">
            <Clause number="2.1">
              O objeto do presente instrumento é a concessão, pela OrthoClinic ao Contratante, de
              uma <strong>licença de uso não exclusiva, intransferível e revogável</strong> da
              plataforma de gestão de consultório ortopédico denominada <strong>OrthoClinic</strong>,
              disponibilizada em ambiente de nuvem (SaaS), compreendendo as funcionalidades
              descritas no plano contratado pelo Contratante.
            </Clause>
            <Clause number="2.2">
              A plataforma poderá compreender, conforme o plano contratado, as seguintes
              funcionalidades: prontuário eletrônico, agenda de consultas, agendamento online,
              fila de espera (walk-in), geração de documentos em PDF (prescrições, laudos,
              atestados, fisioterapia), módulo financeiro, automação via WhatsApp, anamnese
              digital, teleconsulta e relatórios gerenciais.
            </Clause>
            <Clause number="2.3">
              A licença é concedida exclusivamente para uso profissional interno do Contratante
              em sua atividade de prestação de serviços de saúde, sendo vedada a revenda,
              sublicenciamento, engenharia reversa, cópia ou qualquer forma de exploração
              comercial do software por terceiros.
            </Clause>
            <Clause number="2.4">
              A OrthoClinic reserva-se o direito de alterar, expandir ou remover funcionalidades
              do sistema, desde que tais alterações não impliquem supressão substancial do
              serviço contratado sem aviso prévio adequado.
            </Clause>
          </Section>

          {/* 3. Do Cadastro e Acesso */}
          <Section number="3" title="Do Cadastro e Acesso">
            <Clause number="3.1">
              O acesso à plataforma depende do cadastro do Contratante, com fornecimento de
              dados verídicos, completos e atualizados, incluindo nome completo ou razão social,
              CPF ou CNPJ, número de registro no CRM, e-mail válido e telefone para contato.
            </Clause>
            <Clause number="3.2">
              O Contratante é integralmente responsável pela confidencialidade das credenciais
              de acesso (login e senha) de todos os usuários cadastrados em sua conta, respondendo
              por todos os atos praticados mediante o uso dessas credenciais, inclusive aqueles
              realizados por terceiros em razão de negligência do próprio Contratante.
            </Clause>
            <Clause number="3.3">
              Em caso de suspeita de comprometimento das credenciais, o Contratante deve notificar
              imediatamente a OrthoClinic pelo canal de suporte e proceder à alteração de senha,
              não sendo a OrthoClinic responsável por danos decorrentes de acesso indevido anterior
              à comunicação.
            </Clause>
            <Clause number="3.4">
              A OrthoClinic poderá, a seu exclusivo critério, suspender ou encerrar o acesso do
              Contratante em caso de suspeita de uso fraudulento, violação destes Termos ou risco
              à integridade do sistema e dos dados de terceiros.
            </Clause>
            <Clause number="3.5">
              O número de usuários simultâneos e de clínicas cadastradas obedecerá aos limites
              do plano vigente. A contratação de usuários ou clínicas adicionais poderá ser feita
              mediante upgrade de plano ou aquisição de licença adicional.
            </Clause>
          </Section>

          {/* 4. Das Responsabilidades do Contratante */}
          <Section number="4" title="Das Responsabilidades do Contratante">
            <Clause number="4.1">
              O Contratante é o único e exclusivo responsável por todas as informações inseridas
              na plataforma, incluindo dados de pacientes, prescrições, laudos, diagnósticos,
              anamneses, registros financeiros e qualquer outro conteúdo gerado por ele ou por
              seus colaboradores.
            </Clause>
            <Clause number="4.2">
              O Contratante reconhece-se como <strong>Controlador de Dados Pessoais</strong>,
              nos termos do art. 5º, VI, da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados
              — LGPD), sendo inteiramente responsável pela coleta, guarda, uso e tratamento dos
              dados pessoais e de saúde de seus pacientes, bem como pelo cumprimento das
              obrigações legais decorrentes desse tratamento, incluindo a obtenção de
              consentimento específico e o atendimento de direitos dos titulares.
            </Clause>
            <Clause number="4.3">
              O Contratante obriga-se a utilizar o sistema em conformidade com a legislação
              vigente, incluindo o Código de Ética Médica do CFM, as Resoluções do Conselho
              Federal de Medicina, a LGPD e demais normas aplicáveis à prática médica e ao
              tratamento de dados sensíveis de saúde.
            </Clause>
            <Clause number="4.4">
              É de responsabilidade exclusiva do Contratante a validade clínica, a precisão
              diagnóstica e a adequação terapêutica de todos os documentos gerados pelo sistema
              (receituários, laudos, atestados, encaminhamentos e similares), não cabendo à
              OrthoClinic qualquer responsabilidade por erros médicos decorrentes do uso das
              informações registradas no sistema.
            </Clause>
            <Clause number="4.5">
              O Contratante compromete-se a manter backup independente de todos os dados críticos
              de sua prática clínica, não podendo responsabilizar a OrthoClinic por perda de
              dados decorrente de falha técnica, encerramento da conta ou qualquer outra hipótese.
            </Clause>
            <Clause number="4.6">
              É vedado ao Contratante utilizar a plataforma para fins ilícitos, para a prática
              de fraudes contra convênios ou planos de saúde, para a emissão de documentos
              médicos falsos ou para qualquer atividade que viole a ética profissional ou a lei.
            </Clause>
          </Section>

          {/* 5. Das Responsabilidades da OrthoClinic */}
          <Section number="5" title="Das Responsabilidades da OrthoClinic">
            <Clause number="5.1">
              A OrthoClinic compromete-se a disponibilizar a plataforma em funcionamento nos
              limites de sua capacidade técnica, envidar esforços razoáveis para a manutenção
              da segurança dos dados armazenados e comunicar ao Contratante, com antecedência
              razoável quando possível, interrupções programadas para manutenção.
            </Clause>
            <Clause number="5.2">
              A OrthoClinic atuará como <strong>Operadora de Dados Pessoais</strong> nos termos
              do art. 5º, VII, da LGPD, tratando os dados dos pacientes do Contratante
              exclusivamente sob suas instruções e para as finalidades descritas nestes Termos
              e na Política de Privacidade, não podendo utilizá-los para fins próprios ou
              comercializá-los.
            </Clause>
            <Clause number="5.3">
              A OrthoClinic adotará medidas técnicas e organizacionais razoáveis para proteção
              dos dados contra acesso não autorizado, destruição, perda ou alteração indevida,
              incluindo criptografia em trânsito e em repouso, controle de acesso baseado em
              funções e monitoramento de incidentes.
            </Clause>
            <Clause number="5.4">
              Em caso de incidente de segurança com potencial impacto a dados pessoais, a
              OrthoClinic notificará o Contratante e, quando exigido pela LGPD, a Autoridade
              Nacional de Proteção de Dados (ANPD), no prazo legal aplicável.
            </Clause>
            <Clause number="5.5">
              A OrthoClinic <strong>não garante</strong> disponibilidade contínua de 24 horas
              por dia, 7 dias por semana, não existindo nível de serviço (SLA) contratualmente
              garantido no presente instrumento. Interrupções poderão ocorrer por razões técnicas,
              de manutenção ou por falha de provedores terceiros.
            </Clause>
          </Section>

          {/* 6. Da Limitação de Responsabilidade */}
          <Section number="6" title="Da Limitação de Responsabilidade">
            <HighlightBox>
              <strong>Atenção — Cláusula essencial.</strong> Leia com atenção antes de utilizar
              o sistema. Esta cláusula define os limites da responsabilidade civil da OrthoClinic
              e é parte essencial do contrato.
            </HighlightBox>

            <Clause number="6.1">
              A OrthoClinic é uma ferramenta de <strong>apoio à gestão clínica e administrativa</strong>.
              O sistema não substitui o julgamento clínico do médico, não realiza diagnósticos
              autônomos e não deve ser utilizado como único fundamento para qualquer decisão
              terapêutica ou cirúrgica.
            </Clause>
            <Clause number="6.2">
              <strong>A OrthoClinic expressamente exclui sua responsabilidade por:</strong>
            </Clause>
            <ul className="list-none space-y-2 ml-4">
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold flex-shrink-0">a)</span>
                <span>
                  <strong>Erros médicos</strong> — quaisquer danos causados a pacientes em
                  decorrência de diagnósticos, prescrições, condutas terapêuticas ou decisões
                  clínicas tomadas pelo Contratante com ou sem suporte do sistema;
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold flex-shrink-0">b)</span>
                <span>
                  <strong>Perda ou corrupção de dados por falha de terceiros</strong> — incluindo,
                  mas não se limitando a, falhas nos provedores de infraestrutura em nuvem
                  (Render, Cloudflare, Amazon Web Services, ou quaisquer outros), falhas de
                  conectividade de internet, desastres naturais, ataques cibernéticos a
                  infraestrutura de terceiros, ou qualquer evento fora do controle direto
                  da OrthoClinic;
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold flex-shrink-0">c)</span>
                <span>
                  <strong>Indisponibilidade do sistema</strong> — paralisações, lentidão ou
                  interrupções do serviço, independentemente da causa, origem ou duração,
                  não estando garantido nenhum tempo mínimo de operação;
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold flex-shrink-0">d)</span>
                <span>
                  <strong>Decisões clínicas baseadas no sistema</strong> — danos oriundos
                  do uso das informações, relatórios, sugestões ou documentos gerados pela
                  plataforma como fundamento para condutas médicas;
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold flex-shrink-0">e)</span>
                <span>
                  <strong>Atos dos colaboradores do Contratante</strong> — danos causados
                  por uso indevido do sistema por secretárias, recepcionistas, enfermeiros
                  ou outros funcionários cadastrados pelo Contratante;
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold flex-shrink-0">f)</span>
                <span>
                  <strong>Perda de receita ou lucros cessantes</strong> — danos indiretos,
                  mediatos, lucros cessantes, perda de clientela ou quaisquer danos de
                  natureza consequencial decorrentes do uso ou da impossibilidade de uso
                  do sistema.
                </span>
              </li>
            </ul>

            <Clause number="6.3">
              Nos casos em que a responsabilidade da OrthoClinic for reconhecida por decisão
              judicial transitada em julgado, o valor total da indenização devida ao Contratante
              ficará limitado, em qualquer hipótese, ao montante efetivamente pago pelo
              Contratante à OrthoClinic nos{" "}
              <strong>últimos 12 (doze) meses</strong> imediatamente anteriores ao evento
              gerador do dano, excluídos os impostos incidentes, não podendo esse valor ser
              excedido a título de danos materiais, morais ou de qualquer outra natureza.
            </Clause>
            <Clause number="6.4">
              O Contratante reconhece que os valores de assinatura praticados refletem e
              incorporam a distribuição de riscos estabelecida nesta cláusula, sendo o preço
              fixado em consonância com a limitação de responsabilidade aqui prevista.
            </Clause>
          </Section>

          {/* 7. Da Propriedade Intelectual */}
          <Section number="7" title="Da Propriedade Intelectual">
            <Clause number="7.1">
              Todo o conteúdo da plataforma OrthoClinic — incluindo, sem limitação, código-fonte,
              código-objeto, interfaces, design visual, logotipos, marcas, textos, fluxos,
              algoritmos, modelos de documentos, banco de dados estrutural e demais elementos —
              é de propriedade exclusiva da OrthoClinic e está protegido pela Lei nº 9.609/1998
              (Lei de Software), pela Lei nº 9.610/1998 (Lei de Direitos Autorais) e pelos
              tratados internacionais de propriedade intelectual dos quais o Brasil é signatário.
            </Clause>
            <Clause number="7.2">
              A concessão de licença de uso prevista nestes Termos não implica transferência de
              titularidade de qualquer direito de propriedade intelectual ao Contratante.
            </Clause>
            <Clause number="7.3">
              Os dados dos pacientes inseridos pelo Contratante permanecem de propriedade e
              responsabilidade do Contratante, cabendo à OrthoClinic apenas custodiá-los como
              Operadora, nos termos da LGPD.
            </Clause>
            <Clause number="7.4">
              É vedado ao Contratante reproduzir, copiar, adaptar, modificar, traduzir,
              descompilar, fazer engenharia reversa, criar obras derivadas ou de qualquer
              forma explorar o software ou qualquer componente da plataforma, sob pena de
              rescisão imediata deste contrato e responsabilização civil e criminal cabível.
            </Clause>
          </Section>

          {/* 8. Da Vigência e Rescisão */}
          <Section number="8" title="Da Vigência e Rescisão">
            <Clause number="8.1">
              O presente instrumento entra em vigor na data de aceite pelo Contratante e
              permanece vigente por prazo indeterminado, renovando-se automaticamente a cada
              período de cobrança (mensal), salvo rescisão por qualquer das Partes.
            </Clause>
            <Clause number="8.2">
              O Contratante poderá rescindir o contrato a qualquer tempo, sem ônus ou multa,
              mediante solicitação expressa pelo canal de suporte. O cancelamento será efetivado
              ao final do período de cobrança em curso, sem direito a reembolso proporcional
              dos dias não utilizados, salvo disposição em contrário expressamente comunicada
              pela OrthoClinic.
            </Clause>
            <Clause number="8.3">
              A OrthoClinic poderá rescindir o contrato, a qualquer tempo e sem ônus, mediante
              aviso prévio de <strong>30 (trinta) dias</strong> ao Contratante, hipótese em que
              será garantido acesso para exportação dos dados pelo mesmo período.
            </Clause>
            <Clause number="8.4">
              A OrthoClinic poderá rescindir o contrato de forma imediata e sem aviso prévio
              em caso de: (i) violação de qualquer cláusula destes Termos; (ii) uso fraudulento
              do sistema; (iii) inadimplência superior a 15 (quinze) dias corridos; ou (iv)
              uso da plataforma para fins ilícitos.
            </Clause>
            <Clause number="8.5">
              Após o encerramento da conta, os dados do Contratante serão retidos pelo prazo
              de <strong>90 (noventa) dias</strong> para eventual exportação mediante solicitação
              formal, sendo eliminados ao final desse prazo, salvo obrigação legal de retenção.
            </Clause>
            <Clause number="8.6">
              Qualquer alteração nos valores de assinatura será comunicada ao Contratante com
              antecedência mínima de <strong>30 (trinta) dias</strong>, sendo o silêncio após
              esse prazo interpretado como aceite tácito. Caso o Contratante discorde dos
              novos valores, poderá cancelar o plano sem ônus antes do início da nova vigência.
            </Clause>
          </Section>

          {/* 9. Das Disposições Gerais */}
          <Section number="9" title="Das Disposições Gerais">
            <Clause number="9.1">
              <strong>Alterações dos Termos.</strong> A OrthoClinic reserva-se o direito de
              alterar estes Termos de Uso a qualquer tempo, comprometendo-se a notificar o
              Contratante por e-mail ou por notificação dentro do próprio sistema com no mínimo
              15 (quinze) dias de antecedência. A continuidade do uso da plataforma após esse
              prazo implicará aceitação automática das novas disposições.
            </Clause>
            <Clause number="9.2">
              <strong>Proteção de Dados.</strong> O tratamento de dados pessoais no âmbito
              deste instrumento obedecerá ao disposto na Lei nº 13.709/2018 (LGPD) e será
              detalhado na Política de Privacidade da OrthoClinic, disponível em{" "}
              <Link href="/privacidade" className="text-blue-600 hover:underline font-medium">
                /privacidade
              </Link>
              , a qual integra estes Termos como anexo.
            </Clause>
            <Clause number="9.3">
              <strong>Cessão.</strong> O Contratante não poderá ceder ou transferir os direitos
              e obrigações decorrentes deste contrato a terceiros sem autorização prévia e
              expressa da OrthoClinic. A OrthoClinic poderá ceder este contrato em caso de
              fusão, aquisição, reestruturação societária ou venda de ativos, comunicando o
              Contratante com antecedência razoável.
            </Clause>
            <Clause number="9.4">
              <strong>Integralidade.</strong> Estes Termos de Uso, juntamente com a Política
              de Privacidade e eventuais aditivos, constituem o acordo integral entre as Partes
              sobre o objeto aqui tratado, substituindo todos os entendimentos anteriores,
              verbais ou escritos.
            </Clause>
            <Clause number="9.5">
              <strong>Nulidade Parcial.</strong> Se qualquer disposição destes Termos for
              considerada inválida ou inexequível por qualquer motivo legal, as demais
              disposições permanecerão em pleno vigor e efeito.
            </Clause>
            <Clause number="9.6">
              <strong>Comunicações.</strong> Todas as comunicações formais entre as Partes
              serão realizadas pelos endereços de e-mail cadastrados no sistema. O Contratante
              é responsável por manter seus dados de contato atualizados na plataforma.
            </Clause>
            <Clause number="9.7">
              <strong>Lei Aplicável e Foro.</strong> O presente instrumento é regido pelas
              leis da República Federativa do Brasil. Para a resolução de quaisquer litígios
              ou controvérsias decorrentes deste contrato, fica eleito o{" "}
              <strong>Foro da Comarca de Campina Grande, Estado da Paraíba</strong>,
              com renúncia expressa a qualquer outro, por mais privilegiado que seja.
            </Clause>
          </Section>

          {/* Assinatura simbólica */}
          <div className="border-t border-slate-100 pt-8 mt-4">
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Campina Grande — PB, 05 de junho de 2026.
              <br />
              <span className="font-medium text-slate-500">OrthoClinic Tecnologia Ltda (em constituição)</span>
              <br />
              Dr. Valth Menezes Guimarães — Administrador
            </p>
          </div>

        </div>

        {/* Links de navegação */}
        <div className="flex flex-wrap justify-center gap-6 mt-10">
          <Link
            href="/planos"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            ← Ver planos e preços
          </Link>
          <Link
            href="/privacidade"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            Política de Privacidade →
          </Link>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 py-8 text-center mt-6">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} OrthoClinic Tecnologia Ltda · Todos os direitos reservados
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Desenvolvido por ortopedistas, para ortopedistas.
        </p>
      </footer>

    </div>
  );
}
