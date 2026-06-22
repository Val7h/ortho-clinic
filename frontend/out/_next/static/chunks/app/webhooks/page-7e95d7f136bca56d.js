(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[1297],{70026:function(e,t,a){Promise.resolve().then(a.bind(a,27297))},27297:function(e,t,a){"use strict";a.r(t),a.d(t,{default:function(){return m}});var s=a(57437),r=a(2265),o=a(5925);let n=[{key:"appointment.created",label:"Consulta criada"},{key:"appointment.updated",label:"Consulta atualizada"},{key:"appointment.cancelled",label:"Consulta cancelada"},{key:"patient.created",label:"Paciente cadastrado"},{key:"patient.updated",label:"Paciente atualizado"},{key:"document.uploaded",label:"Documento enviado"},{key:"payment.received",label:"Pagamento recebido"}],i="http://localhost:8003";function l(){var e;return null!==(e=localStorage.getItem("api_key"))&&void 0!==e?e:""}async function c(e,t){var a;let s=await fetch("".concat(i).concat(e),{...t,headers:{"Content-Type":"application/json",Authorization:"Bearer ".concat(l()),...null!==(a=null==t?void 0:t.headers)&&void 0!==a?a:{}}});if(!s.ok){let e=await s.text();throw Error("HTTP ".concat(s.status,": ").concat(e))}return s.json()}function d(e){return e?new Date(e).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—"}function u(e){let{endpoint:t}=e;return!t.active&&t.circuit_opened_at?(0,s.jsxs)("span",{className:"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700",children:[(0,s.jsx)("span",{className:"w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"}),"Circuito aberto"]}):t.active?t.consecutive_failures>=5?(0,s.jsxs)("span",{className:"px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700",children:[t.consecutive_failures," falhas consecutivas"]}):(0,s.jsx)("span",{className:"px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700",children:"Ativo"}):(0,s.jsx)("span",{className:"px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500",children:"Inativo"})}function p(e){var t,a;let{log:r}=e;return(0,s.jsxs)("tr",{className:"text-sm border-b border-gray-100 last:border-0",children:[(0,s.jsx)("td",{className:"py-2 pr-3 font-mono text-xs text-gray-500 truncate max-w-[120px]",children:r.evt_id}),(0,s.jsx)("td",{className:"py-2 pr-3 text-gray-700",children:r.event_type}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center",children:(0,s.jsx)("span",{className:"px-2 py-0.5 rounded text-xs font-medium ".concat("success"===(a=r.status)?"text-green-600 bg-green-50":"dead"===a?"text-red-700 bg-red-50":"text-yellow-700 bg-yellow-50"),children:r.status})}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center text-gray-600",children:null!==(t=r.http_status)&&void 0!==t?t:"—"}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center text-gray-600",children:r.attempt_number}),(0,s.jsx)("td",{className:"py-2 pr-3 text-center text-gray-600",children:null!=r.duration_ms?"".concat(r.duration_ms,"ms"):"—"}),(0,s.jsx)("td",{className:"py-2 text-gray-500 text-xs",children:d(r.attempted_at)})]})}function m(){var e;let[t,a]=(0,r.useState)([]),[m,x]=(0,r.useState)(!0),[h,f]=(0,r.useState)(!1),[g,y]=(0,r.useState)(null),[b,v]=(0,r.useState)([]),[j,N]=(0,r.useState)([]),[w,k]=(0,r.useState)("deliveries"),[_,E]=(0,r.useState)(null),[C,S]=(0,r.useState)(""),[T,P]=(0,r.useState)([]),[O,D]=(0,r.useState)(""),[I,R]=(0,r.useState)(""),[A,L]=(0,r.useState)(!0),[$,H]=(0,r.useState)(""),[z,B]=(0,r.useState)(!1),M=(0,r.useCallback)(async()=>{try{let e=await c("/api/v1/webhooks");a(e)}catch(e){o.default.error("Erro ao carregar webhooks: ".concat(e.message))}finally{x(!1)}},[]);(0,r.useEffect)(()=>{M()},[M]);let W=(0,r.useCallback)(async e=>{y(e),E(null),k("deliveries");try{let[t,a]=await Promise.all([c("/api/v1/webhooks/".concat(e.id,"/deliveries?limit=50")),c("/api/v1/webhooks/".concat(e.id,"/dead-letters?limit=50"))]);v(t),N(a)}catch(e){o.default.error("Erro ao carregar hist\xf3rico: ".concat(e.message))}},[]),F=async e=>{if(e.preventDefault(),!C)return o.default.error("URL obrigat\xf3ria");if(0===T.length)return o.default.error("Selecione ao menos um evento");let t={url:C,events:T,description:I||null,active:A};O&&(t.secret=O),$.trim()&&(t.ip_allowlist=$.split(",").map(e=>e.trim()).filter(Boolean)),B(!0);try{await c("/api/v1/webhooks",{method:"POST",body:JSON.stringify(t)}),o.default.success("Webhook registrado com sucesso"),f(!1),S(""),P([]),D(""),R(""),H(""),M()}catch(e){o.default.error("Erro: ".concat(e.message))}finally{B(!1)}},q=async e=>{try{await c("/api/v1/webhooks/".concat(e.id),{method:"PATCH",body:JSON.stringify({active:!e.active})}),o.default.success(e.active?"Webhook desativado":"Webhook reativado"),M()}catch(e){o.default.error("Erro: ".concat(e.message))}},U=async e=>{if(confirm("Remover webhook ".concat(e.url,"? Esta a\xe7\xe3o n\xe3o pode ser desfeita.")))try{await fetch("".concat(i,"/api/v1/webhooks/").concat(e.id),{method:"DELETE",headers:{Authorization:"Bearer ".concat(l())}}),o.default.success("Webhook removido"),(null==g?void 0:g.id)===e.id&&y(null),M()}catch(e){o.default.error("Erro: ".concat(e.message))}},V=async e=>{try{let a=await c("/api/v1/webhooks/".concat(e.id,"/test"),{method:"POST"});if(E(a),a.delivered)o.default.success("Ping entregue — HTTP ".concat(a.http_status," em ").concat(a.duration_ms,"ms"));else{var t;o.default.error("Ping falhou — ".concat(null!==(t=a.error)&&void 0!==t?t:"HTTP ".concat(a.http_status)))}if((null==g?void 0:g.id)===e.id){let t=await c("/api/v1/webhooks/".concat(e.id,"/deliveries?limit=50"));v(t)}}catch(e){o.default.error("Erro no teste: ".concat(e.message))}},J=async e=>{try{if(await c("/api/v1/webhooks/".concat(e.endpoint_id,"/dead-letters/").concat(e.id,"/replay"),{method:"POST"}),o.default.success("Evento ".concat(e.evt_id," recolocado na fila")),g){let e=await c("/api/v1/webhooks/".concat(g.id,"/dead-letters?limit=50"));N(e)}}catch(e){o.default.error("Erro no replay: ".concat(e.message))}};return(0,s.jsx)("div",{className:"min-h-screen bg-gray-50",children:(0,s.jsxs)("div",{className:"max-w-7xl mx-auto px-4 py-8",children:[(0,s.jsxs)("div",{className:"flex items-center justify-between mb-6",children:[(0,s.jsxs)("div",{children:[(0,s.jsx)("h1",{className:"text-2xl font-bold text-gray-900",children:"Webhooks"}),(0,s.jsx)("p",{className:"text-sm text-gray-500 mt-0.5",children:"Receba notificacoes em tempo real sobre eventos do OrthoClinic"})]}),(0,s.jsx)("button",{onClick:()=>f(!h),className:"px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors",children:h?"Cancelar":"+ Novo webhook"})]}),h&&(0,s.jsxs)("div",{className:"bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm",children:[(0,s.jsx)("h2",{className:"text-base font-semibold text-gray-800 mb-4",children:"Registrar endpoint"}),(0,s.jsxs)("form",{onSubmit:F,className:"space-y-4",children:[(0,s.jsxs)("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[(0,s.jsxs)("div",{className:"md:col-span-2",children:[(0,s.jsx)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:"URL (HTTPS)"}),(0,s.jsx)("input",{type:"url",required:!0,placeholder:"https://meuapp.com/webhooks/orthoclinic",value:C,onChange:e=>S(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"})]}),(0,s.jsxs)("div",{children:[(0,s.jsx)("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Eventos"}),(0,s.jsxs)("div",{className:"grid grid-cols-2 gap-2",children:[(0,s.jsxs)("label",{className:"flex items-center gap-2 text-sm text-gray-700 cursor-pointer",children:[(0,s.jsx)("input",{type:"checkbox",checked:T.includes("*"),onChange:e=>P(e.target.checked?["*"]:[]),className:"rounded border-gray-300 text-blue-600"}),"Todos os eventos (*)"]}),n.map(e=>(0,s.jsxs)("label",{className:"flex items-center gap-2 text-sm text-gray-700 cursor-pointer",children:[(0,s.jsx)("input",{type:"checkbox",disabled:T.includes("*"),checked:T.includes(e.key)||T.includes("*"),onChange:t=>{P(a=>t.target.checked?[...a,e.key]:a.filter(t=>t!==e.key))},className:"rounded border-gray-300 text-blue-600"}),e.label]},e.key))]})]}),(0,s.jsxs)("div",{className:"space-y-4",children:[(0,s.jsxs)("div",{children:[(0,s.jsxs)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:["Secret HMAC-SHA256",(0,s.jsx)("span",{className:"text-gray-400 font-normal ml-1",children:"(opcional, min. 16 chars)"})]}),(0,s.jsx)("input",{type:"password",placeholder:"whsec_...",value:O,onChange:e=>D(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"}),(0,s.jsx)("p",{className:"text-xs text-gray-400 mt-1",children:"Salve agora — nao sera exibido novamente."})]}),(0,s.jsxs)("div",{children:[(0,s.jsx)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:"Descricao"}),(0,s.jsx)("input",{type:"text",placeholder:"Ex: Notificacoes de agendamentos",value:I,onChange:e=>R(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"})]}),(0,s.jsxs)("div",{children:[(0,s.jsxs)("label",{className:"block text-sm font-medium text-gray-700 mb-1",children:["IP Allowlist",(0,s.jsx)("span",{className:"text-gray-400 font-normal ml-1",children:"(CIDR, separados por virgula)"})]}),(0,s.jsx)("input",{type:"text",placeholder:"203.0.113.0/24, 198.51.100.0/24",value:$,onChange:e=>H(e.target.value),className:"w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"})]}),(0,s.jsxs)("label",{className:"flex items-center gap-2 text-sm text-gray-700 cursor-pointer",children:[(0,s.jsx)("input",{type:"checkbox",checked:A,onChange:e=>L(e.target.checked),className:"rounded border-gray-300 text-blue-600"}),"Ativar imediatamente"]})]})]}),(0,s.jsxs)("div",{className:"flex justify-end gap-3 pt-2",children:[(0,s.jsx)("button",{type:"button",onClick:()=>f(!1),className:"px-4 py-2 text-sm text-gray-600 hover:text-gray-800",children:"Cancelar"}),(0,s.jsx)("button",{type:"submit",disabled:z,className:"px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors",children:z?"Salvando...":"Registrar webhook"})]})]})]}),(0,s.jsx)("div",{className:"bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6",children:m?(0,s.jsx)("div",{className:"flex items-center justify-center py-16 text-gray-400 text-sm",children:"Carregando webhooks..."}):0===t.length?(0,s.jsxs)("div",{className:"flex flex-col items-center justify-center py-16 text-gray-400",children:[(0,s.jsx)("svg",{className:"w-10 h-10 mb-3 text-gray-300",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:(0,s.jsx)("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:1.5,d:"M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"})}),(0,s.jsx)("p",{className:"text-sm font-medium",children:"Nenhum webhook registrado"}),(0,s.jsx)("p",{className:"text-xs mt-1",children:'Clique em "+ Novo webhook" para comecar'})]}):(0,s.jsxs)("table",{className:"w-full",children:[(0,s.jsx)("thead",{children:(0,s.jsxs)("tr",{className:"border-b border-gray-100 text-left",children:[(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"URL"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"Eventos"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"Status"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide",children:"Criado"}),(0,s.jsx)("th",{className:"px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"})]})}),(0,s.jsx)("tbody",{children:t.map(e=>(0,s.jsxs)("tr",{className:"border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors cursor-pointer ".concat((null==g?void 0:g.id)===e.id?"bg-blue-50/30":""),onClick:()=>W(e),children:[(0,s.jsxs)("td",{className:"px-4 py-3",children:[(0,s.jsx)("div",{className:"font-mono text-sm text-gray-800 truncate max-w-[300px]",children:e.url}),e.description&&(0,s.jsx)("div",{className:"text-xs text-gray-400 mt-0.5",children:e.description}),(0,s.jsxs)("div",{className:"flex items-center gap-2 mt-1",children:[e.secret_hint&&(0,s.jsxs)("span",{className:"text-xs text-gray-400 font-mono",children:["secret: ",e.secret_hint]}),e.has_ip_allowlist&&(0,s.jsx)("span",{className:"text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded",children:"IP allowlist"}),e.has_mtls&&(0,s.jsx)("span",{className:"text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded",children:"mTLS"})]})]}),(0,s.jsx)("td",{className:"px-4 py-3",children:(0,s.jsx)("div",{className:"flex flex-wrap gap-1",children:(e.events.includes("*")?["*"]:e.events).map(e=>(0,s.jsx)("span",{className:"text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono",children:e},e))})}),(0,s.jsx)("td",{className:"px-4 py-3",children:(0,s.jsx)(u,{endpoint:e})}),(0,s.jsx)("td",{className:"px-4 py-3 text-xs text-gray-400",children:d(e.created_at)}),(0,s.jsx)("td",{className:"px-4 py-3",onClick:e=>e.stopPropagation(),children:(0,s.jsxs)("div",{className:"flex items-center gap-2",children:[(0,s.jsx)("button",{onClick:()=>V(e),title:"Enviar ping de teste",className:"text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors",children:"Testar"}),(0,s.jsx)("button",{onClick:()=>q(e),title:e.active?"Desativar":"Reativar",className:"text-xs px-2 py-1 rounded transition-colors ".concat(e.active?"bg-yellow-50 hover:bg-yellow-100 text-yellow-700":"bg-green-50 hover:bg-green-100 text-green-700"),children:e.active?"Pausar":"Ativar"}),(0,s.jsx)("button",{onClick:()=>U(e),title:"Remover webhook",className:"text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 transition-colors",children:"Remover"})]})})]},e.id))})]})}),g&&(0,s.jsxs)("div",{className:"bg-white border border-gray-200 rounded-xl shadow-sm",children:[(0,s.jsxs)("div",{className:"px-6 py-4 border-b border-gray-100 flex items-center justify-between",children:[(0,s.jsxs)("div",{children:[(0,s.jsxs)("h2",{className:"text-sm font-semibold text-gray-800",children:["Historico — ",(0,s.jsx)("span",{className:"font-mono text-blue-700",children:g.url})]}),(0,s.jsxs)("p",{className:"text-xs text-gray-400 mt-0.5",children:[g.consecutive_failures," falhas consecutivas",g.circuit_opened_at&&" — circuito aberto em ".concat(d(g.circuit_opened_at))]})]}),(0,s.jsx)("button",{onClick:()=>y(null),className:"text-gray-400 hover:text-gray-600",children:(0,s.jsx)("svg",{className:"w-5 h-5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:(0,s.jsx)("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M6 18L18 6M6 6l12 12"})})})]}),_&&(0,s.jsxs)("div",{className:"mx-6 mt-4 px-4 py-3 rounded-lg text-sm ".concat(_.delivered?"bg-green-50 text-green-800":"bg-red-50 text-red-800"),children:[(0,s.jsxs)("div",{className:"flex items-center justify-between",children:[(0,s.jsx)("span",{className:"font-medium",children:_.delivered?"Ping entregue":"Ping falhou"}),(0,s.jsxs)("span",{className:"text-xs opacity-70",children:["HTTP ",null!==(e=_.http_status)&&void 0!==e?e:"—"," • ",_.duration_ms,"ms"]})]}),_.error&&(0,s.jsx)("p",{className:"text-xs mt-1 opacity-80",children:_.error})]}),(0,s.jsx)("div",{className:"flex border-b border-gray-100 px-6 mt-4",children:["deliveries","dead"].map(e=>(0,s.jsx)("button",{onClick:()=>k(e),className:"pb-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors ".concat(w===e?"border-blue-600 text-blue-700":"border-transparent text-gray-500 hover:text-gray-700"),children:"deliveries"===e?"Entregas (".concat(b.length,")"):"Fila morta (".concat(j.length,")")},e))}),(0,s.jsxs)("div",{className:"p-6",children:["deliveries"===w&&(0===b.length?(0,s.jsx)("p",{className:"text-sm text-gray-400 text-center py-8",children:"Nenhuma entrega registrada ainda."}):(0,s.jsx)("div",{className:"overflow-x-auto",children:(0,s.jsxs)("table",{className:"w-full",children:[(0,s.jsx)("thead",{children:(0,s.jsxs)("tr",{className:"text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100",children:[(0,s.jsx)("th",{className:"pb-2 pr-3",children:"ID evento"}),(0,s.jsx)("th",{className:"pb-2 pr-3",children:"Tipo"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"Status"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"HTTP"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"Tentativa"}),(0,s.jsx)("th",{className:"pb-2 pr-3 text-center",children:"Duracao"}),(0,s.jsx)("th",{className:"pb-2",children:"Data/hora"})]})}),(0,s.jsx)("tbody",{children:b.map(e=>(0,s.jsx)(p,{log:e},e.id))})]})})),"dead"===w&&(0===j.length?(0,s.jsx)("p",{className:"text-sm text-gray-400 text-center py-8",children:"Nenhum evento na fila morta."}):(0,s.jsx)("div",{className:"space-y-3",children:j.map(e=>(0,s.jsx)("div",{className:"border border-red-100 rounded-lg p-4 bg-red-50/30",children:(0,s.jsxs)("div",{className:"flex items-start justify-between gap-4",children:[(0,s.jsxs)("div",{className:"flex-1 min-w-0",children:[(0,s.jsxs)("div",{className:"flex items-center gap-2 mb-1",children:[(0,s.jsx)("span",{className:"font-mono text-xs text-gray-500",children:e.evt_id}),(0,s.jsx)("span",{className:"text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded",children:e.event_type})]}),(0,s.jsxs)("p",{className:"text-xs text-gray-500",children:[e.total_attempts," tentativas • ultima em ",d(e.last_attempted_at)]}),e.last_error&&(0,s.jsx)("p",{className:"text-xs text-red-700 mt-1 font-mono truncate",children:e.last_error}),e.replayed_at&&(0,s.jsxs)("p",{className:"text-xs text-green-700 mt-1",children:["Recolocado na fila em ",d(e.replayed_at),e.replay_task_id&&" (task: ".concat(e.replay_task_id.slice(0,8),"...)")]})]}),(0,s.jsx)("button",{onClick:()=>J(e),disabled:!!e.replayed_at,className:"shrink-0 text-xs px-3 py-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors",children:e.replayed_at?"Reenviado":"Reenviar"})]})},e.id))}))]})]}),(0,s.jsxs)("div",{className:"mt-8 bg-gray-900 rounded-xl p-6 text-sm",children:[(0,s.jsx)("h3",{className:"text-gray-300 font-semibold mb-3",children:"Verificar assinatura (Python)"}),(0,s.jsx)("pre",{className:"text-green-400 font-mono text-xs leading-relaxed overflow-x-auto",children:'import hashlib, hmac, secrets\n\ndef verify_signature(payload: bytes, header: str, secret: str) -> bool:\n    expected = "sha256=" + hmac.new(\n        secret.encode(), payload, hashlib.sha256\n    ).hexdigest()\n    received = header  # X-OrthoClinic-Signature header value\n    return secrets.compare_digest(expected, received)\n\n# No seu endpoint:\n# raw_body = await request.body()\n# sig      = request.headers["X-OrthoClinic-Signature"]\n# if not verify_signature(raw_body, sig, WEBHOOK_SECRET):\n#     raise HTTPException(403, "Invalid signature")'}),(0,s.jsx)("h3",{className:"text-gray-300 font-semibold mb-3 mt-5",children:"Verificar assinatura (Node.js)"}),(0,s.jsx)("pre",{className:"text-green-400 font-mono text-xs leading-relaxed overflow-x-auto",children:'const crypto = require("crypto");\n\nfunction verifySignature(payload, header, secret) {\n  const expected = "sha256=" + crypto\n    .createHmac("sha256", secret)\n    .update(payload)\n    .digest("hex");\n  return crypto.timingSafeEqual(\n    Buffer.from(expected),\n    Buffer.from(header)\n  );\n}'})]})]})})}},30622:function(e,t,a){"use strict";var s=a(2265),r=Symbol.for("react.element"),o=Symbol.for("react.fragment"),n=Object.prototype.hasOwnProperty,i=s.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,l={key:!0,ref:!0,__self:!0,__source:!0};function c(e,t,a){var s,o={},c=null,d=null;for(s in void 0!==a&&(c=""+a),void 0!==t.key&&(c=""+t.key),void 0!==t.ref&&(d=t.ref),t)n.call(t,s)&&!l.hasOwnProperty(s)&&(o[s]=t[s]);if(e&&e.defaultProps)for(s in t=e.defaultProps)void 0===o[s]&&(o[s]=t[s]);return{$$typeof:r,type:e,key:c,ref:d,props:o,_owner:i.current}}t.Fragment=o,t.jsx=c,t.jsxs=c},57437:function(e,t,a){"use strict";e.exports=a(30622)},5925:function(e,t,a){"use strict";let s,r;a.r(t),a.d(t,{CheckmarkIcon:function(){return Z},ErrorIcon:function(){return V},LoaderIcon:function(){return X},ToastBar:function(){return el},ToastIcon:function(){return ea},Toaster:function(){return ep},default:function(){return em},resolveValue:function(){return k},toast:function(){return B},useToaster:function(){return W},useToasterStore:function(){return $}});var o,n=a(2265);let i={data:""},l=e=>{if("object"==typeof window){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||i},c=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,d=/\/\*[^]*?\*\/|  +/g,u=/\n+/g,p=(e,t)=>{let a="",s="",r="";for(let o in e){let n=e[o];"@"==o[0]?"i"==o[1]?a=o+" "+n+";":s+="f"==o[1]?p(n,o):o+"{"+p(n,"k"==o[1]?"":t)+"}":"object"==typeof n?s+=p(n,t?t.replace(/([^,])+/g,e=>o.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):o):null!=n&&(o="-"==o[1]?o:o.replace(/[A-Z]/g,"-$&").toLowerCase(),r+=p.p?p.p(o,n):o+":"+n+";")}return a+(t&&r?t+"{"+r+"}":r)+s},m={},x=e=>{if("object"==typeof e){let t="";for(let a in e)t+=a+x(e[a]);return t}return e},h=(e,t,a,s,r)=>{var o;let n=x(e),i=m[n]||(m[n]=(e=>{let t=0,a=11;for(;t<e.length;)a=101*a+e.charCodeAt(t++)>>>0;return"go"+a})(n));if(!m[i]){let t=n!==e?e:(e=>{let t,a,s=[{}];for(;t=c.exec(e.replace(d,""));)t[4]?s.shift():t[3]?(a=t[3].replace(u," ").trim(),s.unshift(s[0][a]=s[0][a]||{})):s[0][t[1]]=t[2].replace(u," ").trim();return s[0]})(e);m[i]=p(r?{["@keyframes "+i]:t}:t,a?"":"."+i)}let l=a&&m.g;return a&&(m.g=m[i]),o=m[i],l?t.data=t.data.replace(l,o):-1===t.data.indexOf(o)&&(t.data=s?o+t.data:t.data+o),i},f=(e,t,a)=>e.reduce((e,s,r)=>{let o=t[r];if(o&&o.call){let e=o(a),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;o=t?"."+t:e&&"object"==typeof e?e.props?"":p(e,""):!1===e?"":e}return e+s+(null==o?"":o)},"");function g(e){let t=this||{},a=e.call?e(t.p):e;return h(a.unshift?a.raw?f(a,[].slice.call(arguments,1),t.p):a.reduce((e,a)=>Object.assign(e,a&&a.call?a(t.p):a),{}):a,l(t.target),t.g,t.o,t.k)}g.bind({g:1});let y,b,v,j=g.bind({k:1});function N(e,t){let a=this||{};return function(){let s=arguments;function r(o,n){let i=Object.assign({},o),l=i.className||r.className;a.p=Object.assign({theme:b&&b()},i),a.o=/go\d/.test(l),i.className=g.apply(a,s)+(l?" "+l:""),t&&(i.ref=n);let c=e;return e[0]&&(c=i.as||e,delete i.as),v&&c[0]&&v(i),y(c,i)}return t?t(r):r}}var w=e=>"function"==typeof e,k=(e,t)=>w(e)?e(t):e,_=(s=0,()=>(++s).toString()),E=()=>{if(void 0===r&&"u">typeof window){let e=matchMedia("(prefers-reduced-motion: reduce)");r=!e||e.matches}return r},C="default",S=(e,t)=>{let{toastLimit:a}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,a)};case 1:return{...e,toasts:e.toasts.map(e=>e.id===t.toast.id?{...e,...t.toast}:e)};case 2:let{toast:s}=t;return S(e,{type:e.toasts.find(e=>e.id===s.id)?1:0,toast:s});case 3:let{toastId:r}=t;return{...e,toasts:e.toasts.map(e=>e.id===r||void 0===r?{...e,dismissed:!0,visible:!1}:e)};case 4:return void 0===t.toastId?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(e=>e.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let o=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(e=>({...e,pauseDuration:e.pauseDuration+o}))}}},T=[],P={toasts:[],pausedAt:void 0,settings:{toastLimit:20}},O={},D=(e,t=C)=>{O[t]=S(O[t]||P,e),T.forEach(([e,a])=>{e===t&&a(O[t])})},I=e=>Object.keys(O).forEach(t=>D(e,t)),R=e=>Object.keys(O).find(t=>O[t].toasts.some(t=>t.id===e)),A=(e=C)=>t=>{D(t,e)},L={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},$=(e={},t=C)=>{let[a,s]=(0,n.useState)(O[t]||P),r=(0,n.useRef)(O[t]);(0,n.useEffect)(()=>(r.current!==O[t]&&s(O[t]),T.push([t,s]),()=>{let e=T.findIndex(([e])=>e===t);e>-1&&T.splice(e,1)}),[t]);let o=a.toasts.map(t=>{var a,s,r;return{...e,...e[t.type],...t,removeDelay:t.removeDelay||(null==(a=e[t.type])?void 0:a.removeDelay)||(null==e?void 0:e.removeDelay),duration:t.duration||(null==(s=e[t.type])?void 0:s.duration)||(null==e?void 0:e.duration)||L[t.type],style:{...e.style,...null==(r=e[t.type])?void 0:r.style,...t.style}}});return{...a,toasts:o}},H=(e,t="blank",a)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...a,id:(null==a?void 0:a.id)||_()}),z=e=>(t,a)=>{let s=H(t,e,a);return A(s.toasterId||R(s.id))({type:2,toast:s}),s.id},B=(e,t)=>z("blank")(e,t);B.error=z("error"),B.success=z("success"),B.loading=z("loading"),B.custom=z("custom"),B.dismiss=(e,t)=>{let a={type:3,toastId:e};t?A(t)(a):I(a)},B.dismissAll=e=>B.dismiss(void 0,e),B.remove=(e,t)=>{let a={type:4,toastId:e};t?A(t)(a):I(a)},B.removeAll=e=>B.remove(void 0,e),B.promise=(e,t,a)=>{let s=B.loading(t.loading,{...a,...null==a?void 0:a.loading});return"function"==typeof e&&(e=e()),e.then(e=>{let r=t.success?k(t.success,e):void 0;return r?B.success(r,{id:s,...a,...null==a?void 0:a.success}):B.dismiss(s),e}).catch(e=>{let r=t.error?k(t.error,e):void 0;r?B.error(r,{id:s,...a,...null==a?void 0:a.error}):B.dismiss(s)}),e};var M=1e3,W=(e,t="default")=>{let{toasts:a,pausedAt:s}=$(e,t),r=(0,n.useRef)(new Map).current,o=(0,n.useCallback)((e,t=M)=>{if(r.has(e))return;let a=setTimeout(()=>{r.delete(e),i({type:4,toastId:e})},t);r.set(e,a)},[]);(0,n.useEffect)(()=>{if(s)return;let e=Date.now(),r=a.map(a=>{if(a.duration===1/0)return;let s=(a.duration||0)+a.pauseDuration-(e-a.createdAt);if(s<0){a.visible&&B.dismiss(a.id);return}return setTimeout(()=>B.dismiss(a.id,t),s)});return()=>{r.forEach(e=>e&&clearTimeout(e))}},[a,s,t]);let i=(0,n.useCallback)(A(t),[t]),l=(0,n.useCallback)(()=>{i({type:5,time:Date.now()})},[i]),c=(0,n.useCallback)((e,t)=>{i({type:1,toast:{id:e,height:t}})},[i]),d=(0,n.useCallback)(()=>{s&&i({type:6,time:Date.now()})},[s,i]),u=(0,n.useCallback)((e,t)=>{let{reverseOrder:s=!1,gutter:r=8,defaultPosition:o}=t||{},n=a.filter(t=>(t.position||o)===(e.position||o)&&t.height),i=n.findIndex(t=>t.id===e.id),l=n.filter((e,t)=>t<i&&e.visible).length;return n.filter(e=>e.visible).slice(...s?[l+1]:[0,l]).reduce((e,t)=>e+(t.height||0)+r,0)},[a]);return(0,n.useEffect)(()=>{a.forEach(e=>{if(e.dismissed)o(e.id,e.removeDelay);else{let t=r.get(e.id);t&&(clearTimeout(t),r.delete(e.id))}})},[a,o]),{toasts:a,handlers:{updateHeight:c,startPause:l,endPause:d,calculateOffset:u}}},F=j`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,q=j`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,U=j`
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

  animation: ${F} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${q} 0.15s ease-out forwards;
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
    animation: ${U} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,J=j`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,X=N("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${J} 1s linear infinite;
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
`,ea=({toast:e})=>{let{icon:t,type:a,iconTheme:s}=e;return void 0!==t?"string"==typeof t?n.createElement(et,null,t):t:"blank"===a?null:n.createElement(Q,null,n.createElement(X,{...s}),"loading"!==a&&n.createElement(G,null,"error"===a?n.createElement(V,{...s}):n.createElement(Z,{...s})))},es=e=>`
0% {transform: translate3d(0,${-200*e}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,er=e=>`
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
`,ei=(e,t)=>{let a=e.includes("top")?1:-1,[s,r]=E()?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[es(a),er(a)];return{animation:t?`${j(s)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${j(r)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},el=n.memo(({toast:e,position:t,style:a,children:s})=>{let r=e.height?ei(e.position||t||"top-center",e.visible):{opacity:0},o=n.createElement(ea,{toast:e}),i=n.createElement(en,{...e.ariaProps},k(e.message,e));return n.createElement(eo,{className:e.className,style:{...r,...a,...e.style}},"function"==typeof s?s({icon:o,message:i}):n.createElement(n.Fragment,null,o,i))});o=n.createElement,p.p=void 0,y=o,b=void 0,v=void 0;var ec=({id:e,className:t,style:a,onHeightUpdate:s,children:r})=>{let o=n.useCallback(t=>{if(t){let a=()=>{s(e,t.getBoundingClientRect().height)};a(),new MutationObserver(a).observe(t,{subtree:!0,childList:!0,characterData:!0})}},[e,s]);return n.createElement("div",{ref:o,className:t,style:a},r)},ed=(e,t)=>{let a=e.includes("top"),s=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:E()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(a?1:-1)}px)`,...a?{top:0}:{bottom:0},...s}},eu=g`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,ep=({reverseOrder:e,position:t="top-center",toastOptions:a,gutter:s,children:r,toasterId:o,containerStyle:i,containerClassName:l})=>{let{toasts:c,handlers:d}=W(a,o);return n.createElement("div",{"data-rht-toaster":o||"",style:{position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none",...i},className:l,onMouseEnter:d.startPause,onMouseLeave:d.endPause},c.map(a=>{let o=a.position||t,i=ed(o,d.calculateOffset(a,{reverseOrder:e,gutter:s,defaultPosition:t}));return n.createElement(ec,{id:a.id,key:a.id,onHeightUpdate:d.updateHeight,className:a.visible?eu:"",style:i},"custom"===a.type?k(a.message,a):r?r(a):n.createElement(el,{toast:a,position:o}))}))},em=B}},function(e){e.O(0,[2971,4938,1744],function(){return e(e.s=70026)}),_N_E=e.O()}]);