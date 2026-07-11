(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[1297],{62601:function(e,t,r){"use strict";var a,s;e.exports=(null==(a=r.g.process)?void 0:a.env)&&"object"==typeof(null==(s=r.g.process)?void 0:s.env)?r.g.process:r(58960)},70026:function(e,t,r){Promise.resolve().then(r.bind(r,27297))},27297:function(e,t,r){"use strict";r.r(t),r.d(t,{default:function(){return h}});var a,s=r(57437),o=r(2265),n=r(5925),i=r(62601);let l=[{key:"appointment.created",label:"Consulta criada"},{key:"appointment.updated",label:"Consulta atualizada"},{key:"appointment.cancelled",label:"Consulta cancelada"},{key:"patient.created",label:"Paciente cadastrado"},{key:"patient.updated",label:"Paciente atualizado"},{key:"document.uploaded",label:"Documento enviado"},{key:"payment.received",label:"Pagamento recebido"}],c=null!==(a=i.env.NEXT_PUBLIC_API_URL)&&void 0!==a?a:"";function d(){var e;return null!==(e=localStorage.getItem("api_key"))&&void 0!==e?e:""}async function u(e,t){var r;let a=await fetch("".concat(c).concat(e),{...t,headers:{"Content-Type":"application/json",Authorization:"Bearer ".concat(d()),...null!==(r=null==t?void 0:t.headers)&&void 0!==r?r:{}}});if(!a.ok){let e=await a.text();throw Error("HTTP ".concat(a.status,": ").concat(e))}return a.json()}function p(e){return e?new Date(e).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—"}function m(e){let{endpoint:t}=e;return!t.active&&t.circuit_opened_at?(0,s.jsxs)("span",{className:"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700",children:[(0,s.jsx)("span",{className:"w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"}),"Circuito aberto"]}):t.active?t.consecutive_failures>=5?(0,s.jsxs)("span",{className:"px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700",children:[t.consecutive_failures," falhas consecutivas"]}):(0,s.jsx)("span",{className:"px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700",children:"Ativo"}):(0,s.jsx)("span",{className:"px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500",children:"Inativo"})}function x(e){var t,r;let{log:a}=e;return(0,s.jsxs)("tr",{className:"text-sm border-b border-gray-100 last:border-0",children:[(0,s.jsx)("td",{className:"py-2 pr-3 font-mono text-xs text-gray-500 truncate max-w-[120px]",children:a.evt_id}),(0,s.jsx)("td",{className:"py-2 pr-3 text-gray-700",children:a.event_type}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center",children:(0,s.jsx)("span",{className:"px-2 py-0.5 rounded text-xs font-medium ".concat("success"===(r=a.status)?"text-green-600 bg-green-50":"dead"===r?"text-red-700 bg-red-50":"text-yellow-700 bg-yellow-50"),children:a.status})}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center text-gray-600",children:null!==(t=a.http_status)&&void 0!==t?t:"—"}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center text-gray-600",children:a.attempt_number}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center text-gray-600",children:null!=a.duration_ms?"".concat(a.duration_ms,"ms"):"—"}),(0,s.jsx)("td",{className:"py-2 text-gray-500 text-xs",children:p(a.attempted_at)})]})}function h(){var e;let[t,r]=(0,o.useState)([]),[a,i]=(0,o.useState)(!0),[h,f]=(0,o.useState)(!1),[g,y]=(0,o.useState)(null),[b,v]=(0,o.useState)([]),[j,N]=(0,o.useState)([]),[w,k]=(0,o.useState)("deliveries"),[_,E]=(0,o.useState)(null),[C,T]=(0,o.useState)(""),[S,P]=(0,o.useState)([]),[O,L]=(0,o.useState)(""),[I,D]=(0,o.useState)(""),[R,A]=(0,o.useState)(!0),[$,H]=(0,o.useState)(""),[z,B]=(0,o.useState)(!1),M=(0,o.useCallback)(async()=>{try{let e=await u("/api/v1/webhooks");r(e)}catch(e){n.default.error("Erro ao carregar webhooks: ".concat(e.message))}finally{i(!1)}},[]);(0,o.useEffect)(()=>{M()},[M]);let U=(0,o.useCallback)(async e=>{y(e),E(null),k("deliveries");try{let[t,r]=await Promise.all([u("/api/v1/webhooks/".concat(e.id,"/deliveries?limit=50")),u("/api/v1/webhooks/".concat(e.id,"/dead-letters?limit=50"))]);v(t),N(r)}catch(e){n.default.error("Erro ao carregar hist\xf3rico: ".concat(e.message))}},[]),W=async e=>{if(e.preventDefault(),!C)return n.default.error("URL obrigat\xf3ria");if(0===S.length)return n.default.error("Selecione ao menos um evento");let t={url:C,events:S,description:I||null,active:R};O&&(t.secret=O),$.trim()&&(t.ip_allowlist=$.split(",").map(e=>e.trim()).filter(Boolean)),B(!0);try{await u("/api/v1/webhooks",{method:"POST",body:JSON.stringify(t)}),n.default.success("Webhook registrado com sucesso"),f(!1),T(""),P([]),L(""),D(""),H(""),M()}catch(e){n.default.error("Erro: ".concat(e.message))}finally{B(!1)}},F=async e=>{try{await u("/api/v1/webhooks/".concat(e.id),{method:"PATCH",body:JSON.stringify({active:!e.active})}),n.default.success(e.active?"Webhook desativado":"Webhook reativado"),M()}catch(e){n.default.error("Erro: ".concat(e.message))}},q=async e=>{if(confirm("Remover webhook ".concat(e.url,"? Esta a\xe7\xe3o n\xe3o pode ser desfeita.")))try{await fetch("".concat(c,"/api/v1/webhooks/").concat(e.id),{method:"DELETE",headers:{Authorization:"Bearer ".concat(d())}}),n.default.success("Webhook removido"),(null==g?void 0:g.id)===e.id&&y(null),M()}catch(e){n.default.error("Erro: ".concat(e.message))}},V=async e=>{try{let r=await u("/api/v1/webhooks/".concat(e.id,"/test"),{method:"POST"});if(E(r),r.delivered)n.default.success("Ping entregue — HTTP ".concat(r.http_status," em ").concat(r.duration_ms,"ms"));else{var t;n.default.error("Ping falhou — ".concat(null!==(t=r.error)&&void 0!==t?t:"HTTP ".concat(r.http_status)))}if((null==g?void 0:g.id)===e.id){let t=await u("/api/v1/webhooks/".concat(e.id,"/deliveries?limit=50"));v(t)}}catch(e){n.default.error("Erro no teste: ".concat(e.message))}},X=async e=>{try{if(await u("/api/v1/webhooks/".concat(e.endpoint_id,"/dead-letters/").concat(e.id,"/replay"),{method:"POST"}),n.default.success("Evento ".concat(e.evt_id," recolocado na fila")),g){let e=await u("/api/v1/webhooks/".concat(g.id,"/dead-letters?limit=50"));N(e)}}catch(e){n.default.error("Erro no replay: ".concat(e.message))}};return(0,s.jsx)("div",{className:"min-h-screen bg-gray-50",children:(0,s.jsxs)("div",{className:"max-w-7xl mx-auto px-4 py-8",children:[(0,s.jsxs)("div",{className:"flex items-center justify-between mb-6",children:[(0,s.jsxs)("div",{children:[(0,s.jsx)("h1",{className:"text-2xl font-bold text-gray-900",children:"Webhooks"}),(0,s.jsx)("p",{className:"text-sm text-gray-500 mt-0.5",children:"Receba notificacoes em tempo real sobre eventos do OrthoClinic"})]}),(0,s.jsx)("button",{onClick:()=>f(!h),className:"px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors",children:h?"Cancelar":"+ Novo webhook"})]}),h&&(0,s.jsxs)("div",{className:"bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm",children:[(0,s.jsx)("h2",{className:"text-base font-semibold text-gray-800 mb-4",children:"Registrar endpoint"}),(0,s.jsxs)("form",{onSubmit:W,className:"space-y-4",children:[(0,s.jsxs)("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[(0,s.jsxs)("div",{className:"md:col-span-2",children:[(0,s.jsx)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:"URL (HTTPS)"}),(0,s.jsx)("input",{type:"url",required:!0,placeholder:"https://meuapp.com/webhooks/orthoclinic",value:C,onChange:e=>T(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"})]}),(0,s.jsxs)("div",{children:[(0,s.jsx)("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Eventos"}),(0,s.jsxs)("div",{className:"grid grid-cols-2 gap-2",children:[(0,s.jsxs)("label",{className:"flex items-center gap-2 text-sm text-gray-700 cursor-pointer",children:[(0,s.jsx)("input",{type:"checkbox",checked:S.includes("*"),onChange:e=>P(e.target.checked?["*"]:[]),className:"rounded border-gray-300 text-blue-600"}),"Todos os eventos (*)"]}),l.map(e=>(0,s.jsxs)("label",{className:"flex items-center gap-2 text-sm text-gray-700 cursor-pointer",children:[(0,s.jsx)("input",{type:"checkbox",disabled:S.includes("*"),checked:S.includes(e.key)||S.includes("*"),onChange:t=>{P(r=>t.target.checked?[...r,e.key]:r.filter(t=>t!==e.key))},className:"rounded border-gray-300 text-blue-600"}),e.label]},e.key))]})]}),(0,s.jsxs)("div",{className:"space-y-4",children:[(0,s.jsxs)("div",{children:[(0,s.jsxs)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:["Secret HMAC-SHA256",(0,s.jsx)("span",{className:"text-gray-400 font-normal ml-1",children:"(opcional, min. 16 chars)"})]}),(0,s.jsx)("input",{type:"password",placeholder:"whsec_...",value:O,onChange:e=>L(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"}),(0,s.jsx)("p",{className:"text-xs text-gray-400 mt-1",children:"Salve agora — nao sera exibido novamente."})]}),(0,s.jsxs)("div",{children:[(0,s.jsx)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:"Descricao"}),(0,s.jsx)("input",{type:"text",placeholder:"Ex: Notificacoes de agendamentos",value:I,onChange:e=>D(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"})]}),(0,s.jsxs)("div",{children:[(0,s.jsxs)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:["IP Allowlist",(0,s.jsx)("span",{className:"text-gray-400 font-normal ml-1",children:"(CIDR, separados por virgula)"})]}),(0,s.jsx)("input",{type:"text",placeholder:"203.0.113.0/24, 198.51.100.0/24",value:$,onChange:e=>H(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"})]}),(0,s.jsxs)("label",{className:"flex items-center gap-2 text-sm text-gray-700 cursor-pointer",children:[(0,s.jsx)("input",{type:"checkbox",checked:R,onChange:e=>A(e.target.checked),className:"rounded border-gray-300 text-blue-600"}),"Ativar imediatamente"]})]})]}),(0,s.jsxs)("div",{className:"flex justify-end gap-3 pt-2",children:[(0,s.jsx)("button",{type:"button",onClick:()=>f(!1),className:"px-4 py-2 text-sm text-gray-600 hover:text-gray-800",children:"Cancelar"}),(0,s.jsx)("button",{type:"submit",disabled:z,className:"px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors",children:z?"Salvando...":"Registrar webhook"})]})]})]}),(0,s.jsx)("div",{className:"bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6",children:a?(0,s.jsx)("div",{className:"flex items-center justify-center py-16 text-gray-400 text-sm",children:"Carregando webhooks..."}):0===t.length?(0,s.jsxs)("div",{className:"flex flex-col items-center justify-center py-16 text-gray-400",children:[(0,s.jsx)("svg",{className:"w-10 h-10 mb-3 text-gray-300",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:(0,s.jsx)("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:1.5,d:"M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"})}),(0,s.jsx)("p",{className:"text-sm font-medium",children:"Nenhum webhook registrado"}),(0,s.jsx)("p",{className:"text-xs mt-1",children:'Clique em "+ Novo webhook" para comecar'})]}):(0,s.jsxs)("table",{className:"w-full",children:[(0,s.jsx)("thead",{children:(0,s.jsxs)("tr",{className:"border-b border-gray-100 text-left",children:[(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"URL"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"Eventos"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"Status"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"Criado"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"})]})}),(0,s.jsx)("tbody",{children:t.map(e=>(0,s.jsxs)("tr",{className:"border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer ".concat((null==g?void 0:g.id)===e.id?"bg-blue-50/30":""),onClick:()=>U(e),children:[(0,s.jsxs)("td",{className:"px-4 py-3",children:[(0,s.jsx)("div",{className:"font-mono text-sm text-gray-800 truncate max-w-[300px]",children:e.url}),e.description&&(0,s.jsx)("div",{className:"text-xs text-gray-400 mt-0.5",children:e.description}),(0,s.jsxs)("div",{className:"flex items-center gap-2 mt-1",children:[e.secret_hint&&(0,s.jsxs)("span",{className:"text-xs text-gray-400 font-mono",children:["secret: ",e.secret_hint]}),e.has_ip_allowlist&&(0,s.jsx)("span",{className:"text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded",children:"IP allowlist"}),e.has_mtls&&(0,s.jsx)("span",{className:"text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded",children:"mTLS"})]})]}),(0,s.jsx)("td",{className:"px-4 py-3",children:(0,s.jsx)("div",{className:"flex flex-wrap gap-1",children:(e.events.includes("*")?["*"]:e.events).map(e=>(0,s.jsx)("span",{className:"text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono",children:e},e))})}),(0,s.jsx)("td",{className:"px-4 py-3",children:(0,s.jsx)(m,{endpoint:e})}),(0,s.jsx)("td",{className:"px-4 py-3 text-xs text-gray-400",children:p(e.created_at)}),(0,s.jsx)("td",{className:"px-4 py-3",onClick:e=>e.stopPropagation(),children:(0,s.jsxs)("div",{className:"flex items-center gap-2",children:[(0,s.jsx)("button",{onClick:()=>V(e),title:"Enviar ping de teste",className:"text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors",children:"Testar"}),(0,s.jsx)("button",{onClick:()=>F(e),title:e.active?"Desativar":"Reativar",className:"text-xs px-2 py-1 rounded transition-colors ".concat(e.active?"bg-yellow-50 hover:bg-yellow-100 text-yellow-700":"bg-green-50 hover:bg-green-100 text-green-700"),children:e.active?"Pausar":"Ativar"}),(0,s.jsx)("button",{onClick:()=>q(e),title:"Remover webhook",className:"text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 transition-colors",children:"Remover"})]})})]},e.id))})]})}),g&&(0,s.jsxs)("div",{className:"bg-white border border-gray-200 rounded-xl shadow-sm",children:[(0,s.jsxs)("div",{className:"px-6 py-4 border-b border-gray-100 flex items-center justify-between",children:[(0,s.jsxs)("div",{children:[(0,s.jsxs)("h2",{className:"text-sm font-semibold text-gray-800",children:["Historico — ",(0,s.jsx)("span",{className:"font-mono text-blue-700",children:g.url})]}),(0,s.jsxs)("p",{className:"text-xs text-gray-400 mt-0.5",children:[g.consecutive_failures," falhas consecutivas",g.circuit_opened_at&&" — circuito aberto em ".concat(p(g.circuit_opened_at))]})]}),(0,s.jsx)("button",{onClick:()=>y(null),className:"text-gray-400 hover:text-gray-600",children:(0,s.jsx)("svg",{className:"w-5 h-5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:(0,s.jsx)("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M6 18L18 6M6 6l12 12"})})})]}),_&&(0,s.jsxs)("div",{className:"mx-6 mt-4 px-4 py-3 rounded-lg text-sm ".concat(_.delivered?"bg-green-50 text-green-800":"bg-red-50 text-red-800"),children:[(0,s.jsxs)("div",{className:"flex items-center justify-between",children:[(0,s.jsx)("span",{className:"font-medium",children:_.delivered?"Ping entregue":"Ping falhou"}),(0,s.jsxs)("span",{className:"text-xs opacity-70",children:["HTTP ",null!==(e=_.http_status)&&void 0!==e?e:"—"," • ",_.duration_ms,"ms"]})]}),_.error&&(0,s.jsx)("p",{className:"text-xs mt-1 opacity-80",children:_.error})]}),(0,s.jsx)("div",{className:"flex border-b border-gray-100 px-6 mt-4",children:["deliveries","dead"].map(e=>(0,s.jsx)("button",{onClick:()=>k(e),className:"pb-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors ".concat(w===e?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"),children:"deliveries"===e?"Entregas (".concat(b.length,")"):"Fila morta (".concat(j.length,")")},e))}),(0,s.jsxs)("div",{className:"p-6",children:["deliveries"===w&&(0===b.length?(0,s.jsx)("p",{className:"text-sm text-gray-400 text-center py-8",children:"Nenhuma entrega registrada ainda."}):(0,s.jsx)("div",{className:"overflow-x-auto",children:(0,s.jsxs)("table",{className:"w-full",children:[(0,s.jsx)("thead",{children:(0,s.jsxs)("tr",{className:"text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100",children:[(0,s.jsx)("th",{className:"pb-2 pr-3",children:"ID evento"}),(0,s.jsx)("th",{className:"pb-2 pr-3",children:"Tipo"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"Status"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"HTTP"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"Tentativa"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"Duracao"}),(0,s.jsx)("th",{className:"pb-2",children:"Data/hora"})]})}),(0,s.jsx)("tbody",{children:b.map(e=>(0,s.jsx)(x,{log:e},e.id))})]})})),"dead"===w&&(0===j.length?(0,s.jsx)("p",{className:"text-sm text-gray-400 text-center py-8",children:"Nenhum evento na fila morta."}):(0,s.jsx)("div",{className:"space-y-3",children:j.map(e=>(0,s.jsx)("div",{className:"border border-red-100 rounded-lg p-4 bg-red-50/30",children:(0,s.jsxs)("div",{className:"flex items-start justify-between gap-4",children:[(0,s.jsxs)("div",{className:"flex-1 min-w-0",children:[(0,s.jsxs)("div",{className:"flex items-center gap-2 mb-1",children:[(0,s.jsx)("span",{className:"font-mono text-xs text-gray-500",children:e.evt_id}),(0,s.jsx)("span",{className:"text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded",children:e.event_type})]}),(0,s.jsxs)("p",{className:"text-xs text-gray-500",children:[e.total_attempts," tentativas • ultima em ",p(e.last_attempted_at)]}),e.last_error&&(0,s.jsx)("p",{className:"text-xs text-red-700 mt-1 font-mono truncate",children:e.last_error}),e.replayed_at&&(0,s.jsxs)("p",{className:"text-xs text-green-700 mt-1",children:["Recolocado na fila em ",p(e.replayed_at),e.replay_task_id&&" (task: ".concat(e.replay_task_id.slice(0,8),"...)")]})]}),(0,s.jsx)("button",{onClick:()=>X(e),disabled:!!e.replayed_at,className:"shrink-0 text-xs px-3 py-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors",children:e.replayed_at?"Reenviado":"Reenviar"})]})},e.id))}))]})]}),(0,s.jsxs)("div",{className:"mt-8 bg-gray-900 rounded-xl p-6 text-sm",children:[(0,s.jsx)("h3",{className:"text-gray-300 font-semibold mb-3",children:"Verificar assinatura (Python)"}),(0,s.jsx)("pre",{className:"text-green-400 font-mono text-xs leading-relaxed overflow-x-auto",children:'import hashlib, hmac, secrets\n\ndef verify_signature(payload: bytes, header: str, secret: str) -> bool:\n    expected = "sha256=" + hmac.new(\n        secret.encode(), payload, hashlib.sha256\n    ).hexdigest()\n    received = header  # X-OrthoClinic-Signature header value\n    return secrets.compare_digest(expected, received)\n\n# No seu endpoint:\n# raw_body = await request.body()\n# sig      = request.headers["X-OrthoClinic-Signature"]\n# if not verify_signature(raw_body, sig, WEBHOOK_SECRET):\n#     raise HTTPException(403, "Invalid signature")'}),(0,s.jsx)("h3",{className:"text-gray-300 font-semibold mb-3 mt-5",children:"Verificar assinatura (Node.js)"}),(0,s.jsx)("pre",{className:"text-green-400 font-mono text-xs leading-relaxed overflow-x-auto",children:'const crypto = require("crypto");\n\nfunction verifySignature(payload, header, secret) {\n  const expected = "sha256=" + crypto\n    .createHmac("sha256", secret)\n    .update(payload)\n    .digest("hex");\n  return crypto.timingSafeEqual(\n    Buffer.from(expected),\n    Buffer.from(header)\n  );\n}'})]})]})})}},58960:function(e){!function(){var t={229:function(e){var t,r,a,s=e.exports={};function o(){throw Error("setTimeout has not been defined")}function n(){throw Error("clearTimeout has not been defined")}function i(e){if(t===setTimeout)return setTimeout(e,0);if((t===o||!t)&&setTimeout)return t=setTimeout,setTimeout(e,0);try{return t(e,0)}catch(r){try{return t.call(null,e,0)}catch(r){return t.call(this,e,0)}}}!function(){try{t="function"==typeof setTimeout?setTimeout:o}catch(e){t=o}try{r="function"==typeof clearTimeout?clearTimeout:n}catch(e){r=n}}();var l=[],c=!1,d=-1;function u(){c&&a&&(c=!1,a.length?l=a.concat(l):d=-1,l.length&&p())}function p(){if(!c){var e=i(u);c=!0;for(var t=l.length;t;){for(a=l,l=[];++d<t;)a&&a[d].run();d=-1,t=l.length}a=null,c=!1,function(e){if(r===clearTimeout)return clearTimeout(e);if((r===n||!r)&&clearTimeout)return r=clearTimeout,clearTimeout(e);try{r(e)}catch(t){try{return r.call(null,e)}catch(t){return r.call(this,e)}}}(e)}}function m(e,t){this.fun=e,this.array=t}function x(){}s.nextTick=function(e){var t=Array(arguments.length-1);if(arguments.length>1)for(var r=1;r<arguments.length;r++)t[r-1]=arguments[r];l.push(new m(e,t)),1!==l.length||c||i(p)},m.prototype.run=function(){this.fun.apply(null,this.array)},s.title="browser",s.browser=!0,s.env={},s.argv=[],s.version="",s.versions={},s.on=x,s.addListener=x,s.once=x,s.off=x,s.removeListener=x,s.removeAllListeners=x,s.emit=x,s.prependListener=x,s.prependOnceListener=x,s.listeners=function(e){return[]},s.binding=function(e){throw Error("process.binding is not supported")},s.cwd=function(){return"/"},s.chdir=function(e){throw Error("process.chdir is not supported")},s.umask=function(){return 0}}},r={};function a(e){var s=r[e];if(void 0!==s)return s.exports;var o=r[e]={exports:{}},n=!0;try{t[e](o,o.exports,a),n=!1}finally{n&&delete r[e]}return o.exports}a.ab="//";var s=a(229);e.exports=s}()},30622:function(e,t,r){"use strict";var a=r(2265),s=Symbol.for("react.element"),o=Symbol.for("react.fragment"),n=Object.prototype.hasOwnProperty,i=a.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,l={key:!0,ref:!0,__self:!0,__source:!0};function c(e,t,r){var a,o={},c=null,d=null;for(a in void 0!==r&&(c=""+r),void 0!==t.key&&(c=""+t.key),void 0!==t.ref&&(d=t.ref),t)n.call(t,a)&&!l.hasOwnProperty(a)&&(o[a]=t[a]);if(e&&e.defaultProps)for(a in t=e.defaultProps)void 0===o[a]&&(o[a]=t[a]);return{$$typeof:s,type:e,key:c,ref:d,props:o,_owner:i.current}}t.Fragment=o,t.jsx=c,t.jsxs=c},57437:function(e,t,r){"use strict";e.exports=r(30622)},5925:function(e,t,r){"use strict";let a,s;r.r(t),r.d(t,{CheckmarkIcon:function(){return Z},ErrorIcon:function(){return V},LoaderIcon:function(){return J},ToastBar:function(){return el},ToastIcon:function(){return er},Toaster:function(){return ep},default:function(){return em},resolveValue:function(){return k},toast:function(){return B},useToaster:function(){return U},useToasterStore:function(){return $}});var o,n=r(2265);let i={data:""},l=e=>{if("object"==typeof window){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||i},c=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,d=/\/\*[^]*?\*\/|  +/g,u=/\n+/g,p=(e,t)=>{let r="",a="",s="";for(let o in e){let n=e[o];"@"==o[0]?"i"==o[1]?r=o+" "+n+";":a+="f"==o[1]?p(n,o):o+"{"+p(n,"k"==o[1]?"":t)+"}":"object"==typeof n?a+=p(n,t?t.replace(/([^,])+/g,e=>o.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):o):null!=n&&(o="-"==o[1]?o:o.replace(/[A-Z]/g,"-$&").toLowerCase(),s+=p.p?p.p(o,n):o+":"+n+";")}return r+(t&&s?t+"{"+s+"}":s)+a},m={},x=e=>{if("object"==typeof e){let t="";for(let r in e)t+=r+x(e[r]);return t}return e},h=(e,t,r,a,s)=>{var o;let n=x(e),i=m[n]||(m[n]=(e=>{let t=0,r=11;for(;t<e.length;)r=101*r+e.charCodeAt(t++)>>>0;return"go"+r})(n));if(!m[i]){let t=n!==e?e:(e=>{let t,r,a=[{}];for(;t=c.exec(e.replace(d,""));)t[4]?a.shift():t[3]?(r=t[3].replace(u," ").trim(),a.unshift(a[0][r]=a[0][r]||{})):a[0][t[1]]=t[2].replace(u," ").trim();return a[0]})(e);m[i]=p(s?{["@keyframes "+i]:t}:t,r?"":"."+i)}let l=r&&m.g;return r&&(m.g=m[i]),o=m[i],l?t.data=t.data.replace(l,o):-1===t.data.indexOf(o)&&(t.data=a?o+t.data:t.data+o),i},f=(e,t,r)=>e.reduce((e,a,s)=>{let o=t[s];if(o&&o.call){let e=o(r),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;o=t?"."+t:e&&"object"==typeof e?e.props?"":p(e,""):!1===e?"":e}return e+a+(null==o?"":o)},"");function g(e){let t=this||{},r=e.call?e(t.p):e;return h(r.unshift?r.raw?f(r,[].slice.call(arguments,1),t.p):r.reduce((e,r)=>Object.assign(e,r&&r.call?r(t.p):r),{}):r,l(t.target),t.g,t.o,t.k)}g.bind({g:1});let y,b,v,j=g.bind({k:1});function N(e,t){let r=this||{};return function(){let a=arguments;function s(o,n){let i=Object.assign({},o),l=i.className||s.className;r.p=Object.assign({theme:b&&b()},i),r.o=/go\d/.test(l),i.className=g.apply(r,a)+(l?" "+l:""),t&&(i.ref=n);let c=e;return e[0]&&(c=i.as||e,delete i.as),v&&c[0]&&v(i),y(c,i)}return t?t(s):s}}var w=e=>"function"==typeof e,k=(e,t)=>w(e)?e(t):e,_=(a=0,()=>(++a).toString()),E=()=>{if(void 0===s&&"u">typeof window){let e=matchMedia("(prefers-reduced-motion: reduce)");s=!e||e.matches}return s},C="default",T=(e,t)=>{let{toastLimit:r}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,r)};case 1:return{...e,toasts:e.toasts.map(e=>e.id===t.toast.id?{...e,...t.toast}:e)};case 2:let{toast:a}=t;return T(e,{type:e.toasts.find(e=>e.id===a.id)?1:0,toast:a});case 3:let{toastId:s}=t;return{...e,toasts:e.toasts.map(e=>e.id===s||void 0===s?{...e,dismissed:!0,visible:!1}:e)};case 4:return void 0===t.toastId?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(e=>e.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let o=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(e=>({...e,pauseDuration:e.pauseDuration+o}))}}},S=[],P={toasts:[],pausedAt:void 0,settings:{toastLimit:20}},O={},L=(e,t=C)=>{O[t]=T(O[t]||P,e),S.forEach(([e,r])=>{e===t&&r(O[t])})},I=e=>Object.keys(O).forEach(t=>L(e,t)),D=e=>Object.keys(O).find(t=>O[t].toasts.some(t=>t.id===e)),R=(e=C)=>t=>{L(t,e)},A={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},$=(e={},t=C)=>{let[r,a]=(0,n.useState)(O[t]||P),s=(0,n.useRef)(O[t]);(0,n.useEffect)(()=>(s.current!==O[t]&&a(O[t]),S.push([t,a]),()=>{let e=S.findIndex(([e])=>e===t);e>-1&&S.splice(e,1)}),[t]);let o=r.toasts.map(t=>{var r,a,s;return{...e,...e[t.type],...t,removeDelay:t.removeDelay||(null==(r=e[t.type])?void 0:r.removeDelay)||(null==e?void 0:e.removeDelay),duration:t.duration||(null==(a=e[t.type])?void 0:a.duration)||(null==e?void 0:e.duration)||A[t.type],style:{...e.style,...null==(s=e[t.type])?void 0:s.style,...t.style}}});return{...r,toasts:o}},H=(e,t="blank",r)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...r,id:(null==r?void 0:r.id)||_()}),z=e=>(t,r)=>{let a=H(t,e,r);return R(a.toasterId||D(a.id))({type:2,toast:a}),a.id},B=(e,t)=>z("blank")(e,t);B.error=z("error"),B.success=z("success"),B.loading=z("loading"),B.custom=z("custom"),B.dismiss=(e,t)=>{let r={type:3,toastId:e};t?R(t)(r):I(r)},B.dismissAll=e=>B.dismiss(void 0,e),B.remove=(e,t)=>{let r={type:4,toastId:e};t?R(t)(r):I(r)},B.removeAll=e=>B.remove(void 0,e),B.promise=(e,t,r)=>{let a=B.loading(t.loading,{...r,...null==r?void 0:r.loading});return"function"==typeof e&&(e=e()),e.then(e=>{let s=t.success?k(t.success,e):void 0;return s?B.success(s,{id:a,...r,...null==r?void 0:r.success}):B.dismiss(a),e}).catch(e=>{let s=t.error?k(t.error,e):void 0;s?B.error(s,{id:a,...r,...null==r?void 0:r.error}):B.dismiss(a)}),e};var M=1e3,U=(e,t="default")=>{let{toasts:r,pausedAt:a}=$(e,t),s=(0,n.useRef)(new Map).current,o=(0,n.useCallback)((e,t=M)=>{if(s.has(e))return;let r=setTimeout(()=>{s.delete(e),i({type:4,toastId:e})},t);s.set(e,r)},[]);(0,n.useEffect)(()=>{if(a)return;let e=Date.now(),s=r.map(r=>{if(r.duration===1/0)return;let a=(r.duration||0)+r.pauseDuration-(e-r.createdAt);if(a<0){r.visible&&B.dismiss(r.id);return}return setTimeout(()=>B.dismiss(r.id,t),a)});return()=>{s.forEach(e=>e&&clearTimeout(e))}},[r,a,t]);let i=(0,n.useCallback)(R(t),[t]),l=(0,n.useCallback)(()=>{i({type:5,time:Date.now()})},[i]),c=(0,n.useCallback)((e,t)=>{i({type:1,toast:{id:e,height:t}})},[i]),d=(0,n.useCallback)(()=>{a&&i({type:6,time:Date.now()})},[a,i]),u=(0,n.useCallback)((e,t)=>{let{reverseOrder:a=!1,gutter:s=8,defaultPosition:o}=t||{},n=r.filter(t=>(t.position||o)===(e.position||o)&&t.height),i=n.findIndex(t=>t.id===e.id),l=n.filter((e,t)=>t<i&&e.visible).length;return n.filter(e=>e.visible).slice(...a?[l+1]:[0,l]).reduce((e,t)=>e+(t.height||0)+s,0)},[r]);return(0,n.useEffect)(()=>{r.forEach(e=>{if(e.dismissed)o(e.id,e.removeDelay);else{let t=s.get(e.id);t&&(clearTimeout(t),s.delete(e.id))}})},[r,o]),{toasts:r,handlers:{updateHeight:c,startPause:l,endPause:d,calculateOffset:u}}},W=j`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,F=j`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,q=j`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,V=N("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${W} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${F} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${e=>e.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${q} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,X=j`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,J=N("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${X} 1s linear infinite;
`,Y=j`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,K=j`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,Z=N("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${Y} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${K} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${e=>e.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,G=N("div")`
  position: absolute;
`,Q=N("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,ee=j`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,et=N("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${ee} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,er=({toast:e})=>{let{icon:t,type:r,iconTheme:a}=e;return void 0!==t?"string"==typeof t?n.createElement(et,null,t):t:"blank"===r?null:n.createElement(Q,null,n.createElement(J,{...a}),"loading"!==r&&n.createElement(G,null,"error"===r?n.createElement(V,{...a}):n.createElement(Z,{...a})))},ea=e=>`
0% {transform: translate3d(0,${-200*e}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,es=e=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${-150*e}%,-1px) scale(.6); opacity:0;}
`,eo=N("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,en=N("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,ei=(e,t)=>{let r=e.includes("top")?1:-1,[a,s]=E()?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[ea(r),es(r)];return{animation:t?`${j(a)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${j(s)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},el=n.memo(({toast:e,position:t,style:r,children:a})=>{let s=e.height?ei(e.position||t||"top-center",e.visible):{opacity:0},o=n.createElement(er,{toast:e}),i=n.createElement(en,{...e.ariaProps},k(e.message,e));return n.createElement(eo,{className:e.className,style:{...s,...r,...e.style}},"function"==typeof a?a({icon:o,message:i}):n.createElement(n.Fragment,null,o,i))});o=n.createElement,p.p=void 0,y=o,b=void 0,v=void 0;var ec=({id:e,className:t,style:r,onHeightUpdate:a,children:s})=>{let o=n.useCallback(t=>{if(t){let r=()=>{a(e,t.getBoundingClientRect().height)};r(),new MutationObserver(r).observe(t,{subtree:!0,childList:!0,characterData:!0})}},[e,a]);return n.createElement("div",{ref:o,className:t,style:r},s)},ed=(e,t)=>{let r=e.includes("top"),a=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:E()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(r?1:-1)}px)`,...r?{top:0}:{bottom:0},...a}},eu=g`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,ep=({reverseOrder:e,position:t="top-center",toastOptions:r,gutter:a,children:s,toasterId:o,containerStyle:i,containerClassName:l})=>{let{toasts:c,handlers:d}=U(r,o);return n.createElement("div",{"data-rht-toaster":o||"",style:{position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none",...i},className:l,onMouseEnter:d.startPause,onMouseLeave:d.endPause},c.map(r=>{let o=r.position||t,i=ed(o,d.calculateOffset(r,{reverseOrder:e,gutter:a,defaultPosition:t}));return n.createElement(ec,{id:r.id,key:r.id,onHeightUpdate:d.updateHeight,className:r.visible?eu:"",style:i},"custom"===r.type?k(r.message,r):s?s(r):n.createElement(el,{toast:r,position:o}))}))},em=B}},function(e){e.O(0,[2971,4938,1744],function(){return e(e.s=70026)}),_N_E=e.O()}]);