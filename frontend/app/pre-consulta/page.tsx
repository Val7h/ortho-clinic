"use client";
/**
 * /pre-consulta — Formulário Pré-Consulta público
 *
 * Esta página é servida como HTML estático (output:"export") sem o shell do app.
 * O conteúdo é injetado via dangerouslySetInnerHTML para preservar todo o CSS e
 * JavaScript vanilla do formulário original (backend/static/pre-consulta.html).
 *
 * Query params esperados: ?token=...&exp=...&aid=...&nome=...&tel=...&data=...&motivo=...
 */

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pré-Consulta – CTO</title>
  <style>
    :root {
      --azul: #1a4fa0;
      --azul-claro: #e8f0fc;
      --vermelho: #cc3300;
      --cinza: #555;
      --borda: #dce3ef;
      --radius: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f4f6fb;
      color: #222;
      min-height: 100vh;
    }
    header {
      background: var(--azul);
      color: white;
      padding: 16px 20px 14px;
    }
    header h1 { font-size: 17px; font-weight: 700; }
    header p  { font-size: 12px; opacity: .85; margin-top: 2px; }

    .progresso {
      background: white;
      border-bottom: 1px solid var(--borda);
      padding: 12px 20px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .prog-dots {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 4px;
    }
    .dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #cdd5e0;
      transition: background .3s;
    }
    .dot.ativo   { background: var(--azul); }
    .dot.feito   { background: #27ae60; }
    .prog-texto  { font-size: 12px; color: var(--cinza); }
    .prog-bar    { height: 4px; background: #e0e4ee; border-radius: 2px; margin-top: 8px; }
    .prog-fill   { height: 100%; background: var(--azul); border-radius: 2px; transition: width .4s; }

    main { max-width: 520px; margin: 0 auto; padding: 0 16px 100px; }

    .secao {
      display: none;
      padding-top: 20px;
    }
    .secao.ativa { display: block; }

    .secao-titulo {
      font-size: 15px;
      font-weight: 700;
      color: var(--azul);
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--azul-claro);
    }

    .campo { margin-bottom: 16px; }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--cinza);
      margin-bottom: 5px;
    }
    label .opt { font-weight: 400; color: #999; }

    input[type=text],
    input[type=date],
    input[type=number],
    select,
    textarea {
      width: 100%;
      padding: 11px 13px;
      border: 1.5px solid var(--borda);
      border-radius: var(--radius);
      font-size: 15px;
      color: #222;
      background: white;
      transition: border-color .2s;
      -webkit-appearance: none;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--azul);
    }
    textarea { min-height: 80px; resize: vertical; }

    input[readonly], select[disabled] {
      background: #f0f3f9;
      color: #666;
    }

    .slider-wrap { position: relative; padding-bottom: 20px; }
    input[type=range] {
      width: 100%;
      -webkit-appearance: none;
      height: 8px;
      border-radius: 4px;
      background: linear-gradient(to right, var(--azul) 0%, var(--azul) 0%, #dce3ef 0%);
      border: none;
      padding: 0;
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 24px; height: 24px;
      border-radius: 50%;
      background: var(--azul);
      cursor: pointer;
      border: 3px solid white;
      box-shadow: 0 0 4px rgba(0,0,0,.25);
    }
    .slider-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #999;
      margin-top: 4px;
    }
    .eva-val {
      text-align: center;
      font-size: 28px;
      font-weight: 700;
      color: var(--azul);
      line-height: 1;
    }
    .eva-desc {
      text-align: center;
      font-size: 12px;
      color: var(--cinza);
      margin-top: 2px;
    }

    .radio-group, .check-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .radio-group label, .check-group label {
      display: flex;
      align-items: center;
      gap: 6px;
      background: white;
      border: 1.5px solid var(--borda);
      border-radius: 20px;
      padding: 7px 14px;
      font-size: 14px;
      font-weight: 500;
      color: #333;
      cursor: pointer;
      transition: border-color .15s, background .15s;
      margin-bottom: 0;
    }
    .radio-group input, .check-group input { display: none; }
    .radio-group label:has(input:checked),
    .check-group label:has(input:checked) {
      border-color: var(--azul);
      background: var(--azul-claro);
      color: var(--azul);
    }

    .upload-area {
      border: 2px dashed var(--borda);
      border-radius: var(--radius);
      background: white;
      padding: 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color .2s;
    }
    .upload-area:hover { border-color: var(--azul); }
    .upload-area p { font-size: 14px; color: #999; margin-top: 6px; }
    .upload-icon { font-size: 32px; }
    #upload-input { display: none; }

    .miniaturas {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .miniatura {
      background: #e8f0fc;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--azul);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .spinner {
      display: none;
      width: 18px; height: 18px;
      border: 2px solid var(--borda);
      border-top-color: var(--azul);
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .botoes {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: white;
      border-top: 1px solid var(--borda);
      padding: 12px 20px;
      display: flex;
      gap: 10px;
      max-width: 520px;
      margin: 0 auto;
    }
    @media (min-width: 552px) {
      .botoes { left: 50%; right: auto; transform: translateX(-50%); width: 520px; }
    }

    button {
      flex: 1;
      padding: 14px;
      border: none;
      border-radius: var(--radius);
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity .2s;
    }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .btn-prox { background: var(--azul); color: white; }
    .btn-ant  { background: #eef1f7; color: #444; flex: 0 0 80px; }
    .btn-enviar { background: #27ae60; color: white; }

    .erro-campo {
      font-size: 12px;
      color: var(--vermelho);
      margin-top: 4px;
      display: none;
    }
    .campo.invalido input,
    .campo.invalido select,
    .campo.invalido textarea {
      border-color: var(--vermelho);
    }
    .campo.invalido .erro-campo { display: block; }

    .info-box {
      background: #fff8e1;
      border: 1px solid #ffe082;
      border-radius: var(--radius);
      padding: 12px 14px;
      font-size: 13px;
      color: #7a5c00;
      margin-bottom: 16px;
    }

    #tela-expirado {
      display: none;
      text-align: center;
      padding: 60px 24px;
    }
    #tela-expirado .icon { font-size: 52px; margin-bottom: 16px; }
    #tela-expirado h2 { font-size: 18px; color: #333; margin-bottom: 10px; }
    #tela-expirado p  { font-size: 14px; color: #666; margin-bottom: 24px; }
    #tela-expirado a {
      display: inline-block;
      background: #25d366;
      color: white;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 30px;
      font-weight: 700;
      font-size: 15px;
    }
  </style>
</head>
<body>

<div id="tela-expirado">
  <div class="icon">⏰</div>
  <h2>Link não está mais disponível</h2>
  <p>Este link não está mais disponível. Sem problema — entre em contato pelo WhatsApp e reenviamos em instantes.</p>
  <a href="https://wa.me/5581999179609">Falar com a clínica →</a>
</div>

<div id="app" style="display:none">

  <header>
    <h1>CTO – Formulário Pré-Consulta</h1>
    <p>Dr. Valth Menezes Guimarães · CRM-PB 6326</p>
  </header>

  <div class="progresso">
    <div class="prog-dots">
      <span class="prog-texto">⚡ Rapidinho: leva menos de 1 minuto</span>
    </div>
  </div>

  <main>

    <!-- Seção 1: Queixa Principal -->
    <div class="secao ativa" id="sec1">
      <div class="secao-titulo">Queixa Principal</div>

      <div class="campo" id="c-regiao">
        <label>Região do corpo afetada</label>
        <select id="regiao_corpo">
          <option value="">Selecione…</option>
          <option value="joelho_dir">Joelho direito</option>
          <option value="joelho_esq">Joelho esquerdo</option>
          <option value="quadril">Quadril</option>
          <option value="ombro">Ombro</option>
          <option value="tornozelo">Tornozelo</option>
          <option value="coluna">Coluna</option>
          <option value="mao_punho">Mão / Punho</option>
          <option value="outro">Outro</option>
        </select>
        <div class="erro-campo">Por favor, selecione a região.</div>
      </div>

      <div class="campo" id="c-desc">
        <label>Descreva com suas palavras o que está sentindo</label>
        <textarea id="descricao" placeholder="Ex: Dor ao subir escadas, inchaço no joelho…" rows="3"></textarea>
        <div class="erro-campo">Por favor, descreva o que está sentindo.</div>
      </div>

      <div class="campo">
        <label>Há quanto tempo tem esses sintomas?</label>
        <select id="tempo_sintomas">
          <option value="">Selecione…</option>
          <option value="menos_1sem">Menos de 1 semana</option>
          <option value="1_4sem">1 a 4 semanas</option>
          <option value="1_6meses">1 a 6 meses</option>
          <option value="mais_6meses">Mais de 6 meses</option>
          <option value="mais_1ano">Mais de 1 ano</option>
        </select>
      </div>

      <div class="campo">
        <label>Intensidade da dor agora</label>
        <div class="slider-wrap">
          <div class="eva-val" id="eva-val">5</div>
          <div class="eva-desc" id="eva-desc">Dor moderada</div>
          <input type="range" id="eva" min="0" max="10" value="5" />
          <div class="slider-labels"><span>0 – Sem dor</span><span>10 – Dor máxima</span></div>
        </div>
      </div>

      <div class="campo" id="c-nasc">
        <label>Data de nascimento</label>
        <input type="date" id="nascimento" />
        <div class="erro-campo">Informe sua data de nascimento.</div>
      </div>

      <div class="campo">
        <label>Sexo</label>
        <div class="radio-group" id="grupo-sexo">
          <label><input type="radio" name="sexo" value="F" /> Feminino</label>
          <label><input type="radio" name="sexo" value="M" /> Masculino</label>
        </div>
      </div>

      <div class="campo">
        <label>Alergias a medicamentos <span class="opt">(especialmente dipirona / anti-inflamatórios)</span></label>
        <input type="text" id="alergias" placeholder="Ex: Dipirona — ou 'nenhuma conhecida'" />
      </div>

      <div class="campo">
        <label>Doenças que você tem <span class="opt">(marque as que se aplicam)</span></label>
        <div class="check-group">
          <label><input type="checkbox" name="doencas" value="has" /> Pressão alta</label>
          <label><input type="checkbox" name="doencas" value="dm" /> Diabetes</label>
          <label><input type="checkbox" name="doencas" value="osteoporose" /> Osteoporose</label>
          <label><input type="checkbox" name="doencas" value="artrite" /> Artrite</label>
          <label><input type="checkbox" name="doencas" value="artrose" /> Artrose</label>
          <label><input type="checkbox" name="doencas" value="outra" /> Outra</label>
        </div>
      </div>

      <div class="campo">
        <label>Medicações em uso contínuo <span class="opt">(opcional)</span></label>
        <input type="text" id="medicacoes" placeholder="Ex: Losartana 50mg, AAS 100mg" />
      </div>

      <div class="campo">
        <label>Como vai pagar a consulta?</label>
        <div class="radio-group" id="forma_pagamento">
          <label><input type="radio" name="pagamento" value="particular" /> Particular</label>
          <label><input type="radio" name="pagamento" value="convenio" /> Convênio / plano</label>
        </div>
      </div>

      <div class="campo" id="campo-plano" style="display:none">
        <label>Qual plano de saúde?</label>
        <input type="text" id="plano_saude" placeholder="Ex: Unimed, Bradesco Saúde…" />
      </div>

      <div class="campo">
        <label>Tem exames? Envie foto <span class="opt">(opcional — raio-X, ressonância, laudos)</span></label>
        <div class="upload-area" onclick="document.getElementById('upload-input').click()">
          <div class="upload-icon">📎</div>
          <p>Toque para selecionar imagens ou PDF</p>
          <div class="spinner" id="spinner-upload"></div>
        </div>
        <input type="file" id="upload-input" accept=".jpg,.jpeg,.png,.pdf" multiple />
        <div class="miniaturas" id="miniaturas"></div>
      </div>
    </div>

  </main>

  <div class="botoes" id="botoes">
    <button class="btn-enviar" id="btn-prox" onclick="enviar()">✓ Enviar</button>
  </div>

</div>

<script>
const params = new URLSearchParams(location.search);
const NOME        = params.get('nome')   || '';
const TEL         = params.get('tel')    || '';
const DATA        = params.get('data')   || '';
const MOTIVO      = params.get('motivo') || '';
const AID         = params.get('aid')    || '';
const EXP         = params.get('exp')    || '';
const TOKEN       = params.get('token')  || '';
const UNIDADE     = params.get('unidade')|| '';

const examesUrls = [];

function init() {
  if (!TOKEN || !EXP || !AID) {
    mostrarExpirado();
    return;
  }
  if (Date.now() > parseInt(EXP)) {
    mostrarExpirado();
    return;
  }

  document.getElementById('app').style.display = 'block';

  // Identificação vem do agendamento (link do WhatsApp) — não perguntamos de novo.
  if (NOME) {
    const t = document.querySelector('.secao-titulo');
    if (t) t.textContent = 'Olá, ' + NOME.split(' ')[0] + '! Conte sobre sua queixa';
  }

  const sel = document.getElementById('regiao_corpo');
  for (const opt of sel.options) {
    // opt.value vazio ("Selecione…") casaria com qualquer motivo — pular.
    if (opt.value && MOTIVO.toLowerCase().includes(opt.value.replace('_',' '))) {
      opt.selected = true;
      break;
    }
  }

  initEva();
  initUpload();
  initPagamento();
}

function mostrarExpirado() {
  document.getElementById('tela-expirado').style.display = 'block';
}

const EVA_DESC = ['Sem dor','Dor mínima','Dor leve','Dor leve','Dor moderada','Dor moderada',
                  'Dor intensa','Dor intensa','Dor muito intensa','Dor severa','Dor máxima'];
function initEva() {
  const slider = document.getElementById('eva');
  function atualizar() {
    const v = parseInt(slider.value);
    document.getElementById('eva-val').textContent  = v;
    document.getElementById('eva-desc').textContent = EVA_DESC[v];
    const pct = (v / 10) * 100;
    slider.style.background =
      'linear-gradient(to right, var(--azul) ' + pct + '%, #dce3ef ' + pct + '%)';
  }
  slider.addEventListener('input', atualizar);
  atualizar();
}

function initUpload() {
  const inp = document.getElementById('upload-input');
  inp.addEventListener('change', async () => {
    const files = Array.from(inp.files);
    if (files.length + examesUrls.length > 5) {
      alert('Máximo de 5 arquivos.');
      inp.value = '';
      return;
    }
    for (const f of files) {
      await uploadArquivo(f);
    }
    inp.value = '';
  });
}

async function uploadArquivo(arquivo) {
  const spinner = document.getElementById('spinner-upload');
  spinner.style.display = 'block';
  try {
    const form = new FormData();
    form.append('arquivo', arquivo);
    const res = await fetch(
      '/pre-consulta/upload-exame?token=' + TOKEN + '&exp=' + EXP + '&agendamento_id=' + AID,
      { method: 'POST', body: form }
    );
    if (!res.ok) {
      const { erro } = await res.json();
      if (erro === 'token_expirado') { mostrarExpirado(); return; }
      alert('Erro ao enviar ' + arquivo.name);
      return;
    }
    const { url, nome } = await res.json();
    examesUrls.push(url);
    adicionarMiniatura(nome);
  } catch {
    alert('Falha de rede ao enviar ' + arquivo.name);
  } finally {
    spinner.style.display = 'none';
  }
}

function adicionarMiniatura(nome) {
  const div = document.createElement('div');
  div.className = 'miniatura';
  div.textContent = '✓ ' + nome;
  document.getElementById('miniaturas').appendChild(div);
}

function initPagamento() {
  document.querySelectorAll('input[name="pagamento"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('campo-plano').style.display =
        r.value === 'convenio' ? 'block' : 'none';
    });
  });
}

function validarCampo(idCampo, idInput) {
  const campo = document.getElementById(idCampo);
  const inp   = document.getElementById(idInput);
  if (!inp) return true;
  const vazio = !inp.value || inp.value.trim() === '';
  campo.classList.toggle('invalido', vazio);
  return !vazio;
}

async function enviar() {
  // Folha única: só 3 obrigatórios (região, descrição, nascimento).
  const ok = validarCampo('c-regiao', 'regiao_corpo') &
             validarCampo('c-desc', 'descricao') &
             validarCampo('c-nasc', 'nascimento');
  if (!ok) {
    const inv = document.querySelector('.campo.invalido');
    if (inv) inv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const btnProx = document.getElementById('btn-prox');
  btnProx.disabled = true;
  btnProx.textContent = 'Enviando…';

  const pagamento = document.querySelector('input[name="pagamento"]:checked');
  const doencas   = Array.from(document.querySelectorAll('input[name="doencas"]:checked')).map(i => i.value);

  // Identificação (nome/tel/unidade/data) vem do link do agendamento — sem re-perguntar.
  // Campos cortados da folha única vão vazios (backend trata todos como opcionais).
  const payload = {
    token: TOKEN,
    exp: EXP,
    agendamento_id: AID,
    nome:           NOME,
    telefone:       TEL,
    data_consulta:  DATA,
    nascimento:     document.getElementById('nascimento').value,
    sexo:           (document.querySelector('input[name="sexo"]:checked') || {}).value || null,
    cpf:            '',
    cidade:         '',
    unidade:        UNIDADE,
    bairro:         '',
    profissao:      '',
    estado_civil:   '',
    filhos:         0,
    doencas_cronicas: doencas,
    medicacoes:         document.getElementById('medicacoes').value,
    alergias:           document.getElementById('alergias').value,
    cirurgias_anteriores: '',
    tabagismo:      '',
    alcool:         '',
    regiao_corpo:   document.getElementById('regiao_corpo').value,
    descricao:      document.getElementById('descricao').value,
    tempo_sintomas: document.getElementById('tempo_sintomas').value,
    mecanismo:      '',
    eva:            parseInt(document.getElementById('eva').value),
    piora:          '',
    melhora:        '',
    tratamento_anterior: '',
    uso_analgesicos:     '',
    exames_urls:    examesUrls,
    forma_pagamento: pagamento ? pagamento.value : 'particular',
    plano_saude:    document.getElementById('plano_saude').value || null,
  };

  try {
    const res = await fetch('/pre-consulta/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { erro, token_expirado } = await res.json();
      if (token_expirado) { mostrarExpirado(); return; }
      alert('Erro ao enviar: ' + erro);
      btnProx.disabled = false;
      btnProx.textContent = '✓ Enviar formulário';
      return;
    }

    const dataFmt = DATA ? new Date(DATA).toLocaleDateString('pt-BR') : '';
    const horaFmt = DATA ? new Date(DATA).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
    location.href = '/confirmacao?nome=' + encodeURIComponent(NOME) + '&data=' + encodeURIComponent(dataFmt) + '&hora=' + encodeURIComponent(horaFmt);
  } catch {
    alert('Falha de rede. Verifique sua conexão e tente novamente.');
    btnProx.disabled = false;
    btnProx.textContent = '✓ Enviar formulário';
  }
}

init();
</script>
</body>
</html>`;

export default function PreConsultaPage() {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: HTML_CONTENT }}
      style={{ all: "unset" }}
    />
  );
}
