"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[265],{86264:function(e,t,a){a.d(t,{Z:function(){return s}});/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let s=(0,a(62898).Z)("Loader2",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]])},64280:function(e,t,a){a.d(t,{Z:function(){return s}});/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let s=(0,a(62898).Z)("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]])},82549:function(e,t,a){a.d(t,{Z:function(){return s}});/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let s=(0,a(62898).Z)("X",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]])},90265:function(e,t,a){a.r(t),a.d(t,{DashboardV2:function(){return h}});var s=a(57437),r=a(2265),l=a(86264),o=a(64280);/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,a(62898).Z)("PhoneCall",[["path",{d:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",key:"foiqr5"}],["path",{d:"M14.05 2a9 9 0 0 1 8 7.94",key:"vmijpz"}],["path",{d:"M14.05 6A5 5 0 0 1 18 10",key:"13nbpp"}]]);var i=a(82549),c=a(10826),d=a(5925);function m(e){return(null!=e?e:0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0})}function x(e){return null==e?"—":"".concat(Math.round(100*e),"%")}let p="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4",u="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500";function h(){let[e,t]=(0,r.useState)(null),[a,h]=(0,r.useState)(!0),[f,b]=(0,r.useState)(!1),[g,y]=(0,r.useState)(null),v=()=>{h(!0),c.kx.v2().then(t).catch(()=>d.default.error("Erro ao carregar o dashboard")).finally(()=>h(!1))};(0,r.useEffect)(v,[]);let j=async()=>{if(b(!0),!g)try{y(await c.kx.recall())}catch(e){d.default.error("Erro ao carregar a lista")}};if(a&&!e)return(0,s.jsx)("div",{className:"h-64 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse"});if(!e)return null;let{hoje:N,mes:k,clinicas:_,funil_28d:w,pacientes:C}=e,E=k.receita_mes_anterior>0?(k.receita-k.receita_mes_anterior)/k.receita_mes_anterior:null,D=e=>w.marcados>0?Math.max(8,Math.round(e/w.marcados*100)):0;return(0,s.jsxs)("div",{className:"space-y-6",children:[(0,s.jsxs)("div",{children:[(0,s.jsxs)("div",{className:"flex items-center justify-between mb-2",children:[(0,s.jsx)("p",{className:u,children:"Hoje \xb7 a\xe7\xe3o imediata"}),(0,s.jsx)("button",{onClick:v,className:"text-slate-300 hover:text-slate-500","aria-label":"Atualizar",children:a?(0,s.jsx)(l.Z,{className:"w-4 h-4 animate-spin"}):(0,s.jsx)(o.Z,{className:"w-4 h-4"})})]}),(0,s.jsxs)("div",{className:"grid gap-3 sm:grid-cols-3",children:[(0,s.jsxs)("div",{className:"".concat(p," border-l-4 ").concat(N.nao_confirmados_amanha.length?"border-l-amber-500":"border-l-emerald-500"),children:[(0,s.jsx)("p",{className:"text-sm font-bold text-slate-800 dark:text-slate-100",children:N.nao_confirmados_amanha.length?"⚠️ ".concat(N.nao_confirmados_amanha.length," n\xe3o confirmados amanh\xe3"):"✓ Amanh\xe3 tudo confirmado"}),N.nao_confirmados_amanha.slice(0,3).map((e,t)=>(0,s.jsxs)("p",{className:"text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5",children:[e.nome," \xb7 ",e.clinica,e.telefone?" \xb7 ".concat(e.telefone):""]},t)),N.nao_confirmados_amanha.length>3&&(0,s.jsxs)("p",{className:"text-xs text-slate-400 mt-0.5",children:["+",N.nao_confirmados_amanha.length-3," — lista pra secret\xe1ria ligar"]})]}),(0,s.jsxs)("div",{className:"".concat(p," border-l-4 ").concat(N.cancelados_hoje?"border-l-amber-500":"border-l-emerald-500"),children:[(0,s.jsxs)("p",{className:"text-sm font-bold text-slate-800 dark:text-slate-100",children:[N.pacientes_hoje," paciente",1!==N.pacientes_hoje?"s":""," hoje"]}),(0,s.jsx)("p",{className:"text-xs text-slate-500 dark:text-slate-400 mt-0.5",children:N.cancelados_hoje?"\uD83D\uDD73 ".concat(N.cancelados_hoje," cancelamento").concat(1!==N.cancelados_hoje?"s":""," — vaga pra encaixe"):"nenhum cancelamento"})]}),(0,s.jsxs)("div",{className:"".concat(p," border-l-4 border-l-emerald-500"),children:[(0,s.jsxs)("p",{className:"text-sm font-bold text-slate-800 dark:text-slate-100",children:["\uD83D\uDCB0 Caixa do dia: ",m(N.caixa_dia)]}),(0,s.jsxs)("p",{className:"text-xs text-slate-500 dark:text-slate-400 mt-0.5",children:[N.pagamentos_dia," pagamento",1!==N.pagamentos_dia?"s":""," registrado",1!==N.pagamentos_dia?"s":""]})]})]})]}),(0,s.jsxs)("div",{children:[(0,s.jsx)("p",{className:"".concat(u," mb-2"),children:"O m\xeas em 4 n\xfameros"}),(0,s.jsxs)("div",{className:"grid gap-3 sm:grid-cols-2 xl:grid-cols-4",children:[(0,s.jsxs)("div",{className:p,children:[(0,s.jsx)("p",{className:"text-2xl font-extrabold text-slate-800 dark:text-slate-50",style:{fontVariantNumeric:"tabular-nums"},children:m(k.receita)}),(0,s.jsxs)("p",{className:"text-xs text-slate-500 dark:text-slate-400 mt-0.5",children:["receita do m\xeas \xb7 proje\xe7\xe3o ",(0,s.jsx)("b",{className:"text-slate-700 dark:text-slate-200",children:m(k.projecao)})]}),(0,s.jsxs)("p",{className:"text-[11px] font-bold mt-1",children:[null!=E&&(0,s.jsxs)("span",{className:E>=0?"text-emerald-600":"text-red-500",children:[E>=0?"▲":"▼"," ",Math.abs(Math.round(100*E)),"% vs m\xeas anterior"]}),k.receita_pendente>0&&(0,s.jsxs)("span",{className:"text-slate-400 font-semibold",children:[" \xb7 ",m(k.receita_pendente)," a receber"]})]})]}),(0,s.jsxs)("div",{className:p,children:[(0,s.jsx)("p",{className:"text-2xl font-extrabold text-red-600",style:{fontVariantNumeric:"tabular-nums"},children:m(k.receita_perdida_faltas)}),(0,s.jsxs)("p",{className:"text-xs text-slate-500 dark:text-slate-400 mt-0.5",children:["perdidos com faltas (",k.faltas," falta",1!==k.faltas?"s":"",")"]}),(0,s.jsxs)("p",{className:"text-[11px] font-bold mt-1 text-slate-500",children:["taxa de falta ",x(k.taxa_falta)]})]}),(0,s.jsxs)("div",{className:p,children:[(0,s.jsxs)("p",{className:"text-2xl font-extrabold text-slate-800 dark:text-slate-50",style:{fontVariantNumeric:"tabular-nums"},children:[m(k.ticket_particular)," ",(0,s.jsx)("span",{className:"text-sm text-slate-400 font-bold",children:"\xd7"})," ",m(k.ticket_convenio)]}),(0,s.jsx)("p",{className:"text-xs text-slate-500 dark:text-slate-400 mt-0.5",children:"ticket m\xe9dio: particular \xd7 conv\xeanio"}),(0,s.jsxs)("p",{className:"text-[11px] font-bold mt-1 text-slate-500",children:["geral ",m(k.ticket_geral)]})]}),(0,s.jsxs)("div",{className:p,children:[(0,s.jsx)("p",{className:"text-2xl font-extrabold text-slate-800 dark:text-slate-50",style:{fontVariantNumeric:"tabular-nums"},children:x(k.ocupacao_media)}),(0,s.jsx)("p",{className:"text-xs text-slate-500 dark:text-slate-400 mt-0.5",children:"ocupa\xe7\xe3o m\xe9dia dos turnos (28 dias)"}),null!=k.ocupacao_media&&(0,s.jsx)("div",{className:"mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden",children:(0,s.jsx)("div",{className:"h-full bg-brand-600 rounded-full",style:{width:"".concat(Math.min(100,Math.round(100*k.ocupacao_media)),"%")}})})]})]})]}),(0,s.jsxs)("div",{children:[(0,s.jsx)("p",{className:"".concat(u," mb-2"),children:"Por cl\xednica \xb7 onde o dinheiro est\xe1 (e onde vaza)"}),(0,s.jsx)("div",{className:"overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900",children:(0,s.jsxs)("table",{className:"w-full text-sm",style:{fontVariantNumeric:"tabular-nums"},children:[(0,s.jsx)("thead",{children:(0,s.jsxs)("tr",{className:"text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800",children:[(0,s.jsx)("th",{className:"px-4 py-2.5 font-bold",children:"Cl\xednica"}),(0,s.jsx)("th",{className:"px-3 py-2.5 font-bold",children:"Ocupa\xe7\xe3o"}),(0,s.jsx)("th",{className:"px-3 py-2.5 font-bold",children:"Faltas"}),(0,s.jsx)("th",{className:"px-3 py-2.5 font-bold",children:"Atendidos"}),(0,s.jsx)("th",{className:"px-3 py-2.5 font-bold",children:"Ticket"}),(0,s.jsx)("th",{className:"px-3 py-2.5 font-bold",children:"Receita m\xeas"}),(0,s.jsx)("th",{className:"px-3 py-2.5 font-bold",children:"T. m\xe9dio"})]})}),(0,s.jsx)("tbody",{className:"divide-y divide-slate-50 dark:divide-slate-800/60",children:_.map(e=>(0,s.jsxs)("tr",{children:[(0,s.jsxs)("td",{className:"px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap",children:[(0,s.jsx)("span",{className:"inline-block w-2.5 h-2.5 rounded mr-2 align-middle",style:{backgroundColor:e.color}}),e.nome]}),(0,s.jsx)("td",{className:"px-3 py-2.5 font-bold ".concat(null==e.ocupacao?"text-slate-300":e.ocupacao>=.85?"text-emerald-600":e.ocupacao<.6?"text-amber-600":"text-slate-600 dark:text-slate-300"),children:x(e.ocupacao)}),(0,s.jsx)("td",{className:"px-3 py-2.5 ".concat(null!=e.taxa_falta&&e.taxa_falta>.15?"text-red-600 font-bold":"text-slate-600 dark:text-slate-300"),children:null==e.taxa_falta?"—":"".concat(x(e.taxa_falta)," (").concat(e.faltas,")")}),(0,s.jsx)("td",{className:"px-3 py-2.5 text-slate-600 dark:text-slate-300",children:e.atendidos_mes}),(0,s.jsx)("td",{className:"px-3 py-2.5 text-slate-600 dark:text-slate-300",children:null!=e.ticket?m(e.ticket):"—"}),(0,s.jsx)("td",{className:"px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100",children:e.receita_mes?m(e.receita_mes):"—"}),(0,s.jsxs)("td",{className:"px-3 py-2.5 ".concat(null!=e.tempo_medio_min&&e.slot_min&&e.tempo_medio_min>e.slot_min?"text-amber-600 font-bold":"text-slate-600 dark:text-slate-300"),children:[null!=e.tempo_medio_min?"".concat(e.tempo_medio_min," min"):"—",e.slot_min?(0,s.jsxs)("span",{className:"text-slate-300",children:[" /",e.slot_min]}):null]})]},e.id))})]})}),(0,s.jsx)("p",{className:"text-[11px] text-slate-400 mt-1.5",children:"Receita/ticket por cl\xednica v\xeam dos valores lan\xe7ados na sala de espera; faltas = marcado que n\xe3o compareceu nem cancelou."})]}),(0,s.jsxs)("div",{children:[(0,s.jsx)("p",{className:"".concat(u," mb-2"),children:"M\xe1quina de pacientes"}),(0,s.jsxs)("div",{className:"grid gap-3 lg:grid-cols-2",children:[(0,s.jsxs)("div",{className:p,children:[(0,s.jsx)("p",{className:"text-sm font-bold text-slate-800 dark:text-slate-100 mb-2.5",children:"Funil do bot — \xfaltimas 4 semanas"}),(0,s.jsxs)("div",{className:"space-y-1.5",children:[(0,s.jsxs)("div",{className:"h-7 rounded-lg bg-brand-600 text-white text-xs font-bold flex items-center px-3",style:{width:"100%"},children:["Marcados \xb7 ",w.marcados]}),(0,s.jsxs)("div",{className:"flex items-center gap-2",children:[(0,s.jsxs)("div",{className:"h-7 rounded-lg bg-blue-500 text-white text-xs font-bold flex items-center px-3 whitespace-nowrap",style:{width:"".concat(D(w.confirmados),"%")},children:["Confirmaram \xb7 ",w.confirmados]}),(0,s.jsx)("span",{className:"text-xs font-semibold text-slate-400",children:w.marcados?x(w.confirmados/w.marcados):"—"})]}),(0,s.jsxs)("div",{className:"flex items-center gap-2",children:[(0,s.jsxs)("div",{className:"h-7 rounded-lg bg-emerald-500 text-white text-xs font-bold flex items-center px-3 whitespace-nowrap",style:{width:"".concat(D(w.compareceram),"%")},children:["Compareceram \xb7 ",w.compareceram]}),(0,s.jsx)("span",{className:"text-xs font-semibold text-slate-400",children:w.confirmados?x(w.compareceram/w.confirmados):"—"})]})]}),(0,s.jsxs)("p",{className:"text-[11px] text-slate-400 mt-2.5",children:[C.novos_mes," paciente",1!==C.novos_mes?"s":""," novo",1!==C.novos_mes?"s":""," no m\xeas \xb7 ",C.retornos_mes," retorno",1!==C.retornos_mes?"s":""," \xb7 ",C.folhetos_mes," folheto",1!==C.folhetos_mes?"s":""," de tratamento enviado",1!==C.folhetos_mes?"s":""]})]}),(0,s.jsxs)("div",{className:p,children:[(0,s.jsx)("p",{className:"text-sm font-bold text-slate-800 dark:text-slate-100",children:"Cr\xf4nicos sem retorno h\xe1 6+ meses"}),(0,s.jsxs)("p",{className:"text-3xl font-extrabold text-slate-800 dark:text-slate-50 mt-1",style:{fontVariantNumeric:"tabular-nums"},children:[C.recall_6m," ",(0,s.jsxs)("span",{className:"text-sm font-semibold text-slate-400",children:["paciente",1!==C.recall_6m?"s":""]})]}),(0,s.jsx)("p",{className:"text-xs text-slate-500 dark:text-slate-400 mt-0.5",children:"gonartrose, lombalgia, osteoporose… acompanhamento \xe9 indica\xe7\xe3o cl\xednica — a lista \xe9 pra contato individual, nunca em massa."}),(0,s.jsxs)("button",{onClick:j,className:"mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-3.5 py-2",children:[(0,s.jsx)(n,{className:"w-3.5 h-3.5"})," Ver lista pra secret\xe1ria"]})]})]})]}),f&&(0,s.jsx)("div",{className:"fixed inset-0 z-[200] flex items-center justify-center p-4",style:{background:"rgba(0,0,0,0.6)"},children:(0,s.jsxs)("div",{className:"bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh]",children:[(0,s.jsxs)("div",{className:"px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between",children:[(0,s.jsxs)("div",{children:[(0,s.jsx)("p",{className:"font-bold text-slate-900 dark:text-slate-50 text-sm",children:"Cr\xf4nicos sem retorno — lista de contato"}),(0,s.jsx)("p",{className:"text-xs text-slate-400 mt-0.5",children:"Contato individual pela secret\xe1ria (liga\xe7\xe3o ou mensagem 1 a 1)"})]}),(0,s.jsx)("button",{onClick:()=>b(!1),className:"p-1.5 text-slate-400 hover:text-slate-600 rounded-lg",children:(0,s.jsx)(i.Z,{className:"w-4 h-4"})})]}),(0,s.jsxs)("div",{className:"flex-1 overflow-y-auto p-3 space-y-1.5",children:[!g&&(0,s.jsx)("div",{className:"py-8 text-center",children:(0,s.jsx)(l.Z,{className:"w-5 h-5 animate-spin mx-auto text-slate-300"})}),g&&0===g.length&&(0,s.jsx)("p",{className:"text-sm text-slate-400 text-center py-8",children:"Nenhum cr\xf4nico sumido — base em dia. \uD83D\uDC4F"}),null==g?void 0:g.map(e=>{var t,a;return(0,s.jsxs)("div",{className:"rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2",children:[(0,s.jsx)("p",{className:"text-sm font-semibold text-slate-800 dark:text-slate-100",children:e.nome}),(0,s.jsxs)("p",{className:"text-xs text-slate-500 dark:text-slate-400",children:[e.telefone||"sem telefone"," \xb7 \xfaltima consulta ",null===(t=e.ultima_consulta)||void 0===t?void 0:t.split("-").reverse().join("/"),(null===(a=e.cids)||void 0===a?void 0:a.length)?" \xb7 ".concat(e.cids.map(e=>e.split("—")[0].trim()).join(", ")):e.condicoes?" \xb7 ".concat(e.condicoes):""]})]},e.id)})]})]})})]})}},5925:function(e,t,a){let s,r;a.r(t),a.d(t,{CheckmarkIcon:function(){return K},ErrorIcon:function(){return U},LoaderIcon:function(){return Y},ToastBar:function(){return ei},ToastIcon:function(){return ea},Toaster:function(){return ex},default:function(){return ep},resolveValue:function(){return _},toast:function(){return F},useToaster:function(){return R},useToasterStore:function(){return Z}});var l,o=a(2265);let n={data:""},i=e=>{if("object"==typeof window){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||n},c=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,d=/\/\*[^]*?\*\/|  +/g,m=/\n+/g,x=(e,t)=>{let a="",s="",r="";for(let l in e){let o=e[l];"@"==l[0]?"i"==l[1]?a=l+" "+o+";":s+="f"==l[1]?x(o,l):l+"{"+x(o,"k"==l[1]?"":t)+"}":"object"==typeof o?s+=x(o,t?t.replace(/([^,])+/g,e=>l.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):l):null!=o&&(l="-"==l[1]?l:l.replace(/[A-Z]/g,"-$&").toLowerCase(),r+=x.p?x.p(l,o):l+":"+o+";")}return a+(t&&r?t+"{"+r+"}":r)+s},p={},u=e=>{if("object"==typeof e){let t="";for(let a in e)t+=a+u(e[a]);return t}return e},h=(e,t,a,s,r)=>{var l;let o=u(e),n=p[o]||(p[o]=(e=>{let t=0,a=11;for(;t<e.length;)a=101*a+e.charCodeAt(t++)>>>0;return"go"+a})(o));if(!p[n]){let t=o!==e?e:(e=>{let t,a,s=[{}];for(;t=c.exec(e.replace(d,""));)t[4]?s.shift():t[3]?(a=t[3].replace(m," ").trim(),s.unshift(s[0][a]=s[0][a]||{})):s[0][t[1]]=t[2].replace(m," ").trim();return s[0]})(e);p[n]=x(r?{["@keyframes "+n]:t}:t,a?"":"."+n)}let i=a&&p.g;return a&&(p.g=p[n]),l=p[n],i?t.data=t.data.replace(i,l):-1===t.data.indexOf(l)&&(t.data=s?l+t.data:t.data+l),n},f=(e,t,a)=>e.reduce((e,s,r)=>{let l=t[r];if(l&&l.call){let e=l(a),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;l=t?"."+t:e&&"object"==typeof e?e.props?"":x(e,""):!1===e?"":e}return e+s+(null==l?"":l)},"");function b(e){let t=this||{},a=e.call?e(t.p):e;return h(a.unshift?a.raw?f(a,[].slice.call(arguments,1),t.p):a.reduce((e,a)=>Object.assign(e,a&&a.call?a(t.p):a),{}):a,i(t.target),t.g,t.o,t.k)}b.bind({g:1});let g,y,v,j=b.bind({k:1});function N(e,t){let a=this||{};return function(){let s=arguments;function r(l,o){let n=Object.assign({},l),i=n.className||r.className;a.p=Object.assign({theme:y&&y()},n),a.o=/go\d/.test(i),n.className=b.apply(a,s)+(i?" "+i:""),t&&(n.ref=o);let c=e;return e[0]&&(c=n.as||e,delete n.as),v&&c[0]&&v(n),g(c,n)}return t?t(r):r}}var k=e=>"function"==typeof e,_=(e,t)=>k(e)?e(t):e,w=(s=0,()=>(++s).toString()),C=()=>{if(void 0===r&&"u">typeof window){let e=matchMedia("(prefers-reduced-motion: reduce)");r=!e||e.matches}return r},E="default",D=(e,t)=>{let{toastLimit:a}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,a)};case 1:return{...e,toasts:e.toasts.map(e=>e.id===t.toast.id?{...e,...t.toast}:e)};case 2:let{toast:s}=t;return D(e,{type:e.toasts.find(e=>e.id===s.id)?1:0,toast:s});case 3:let{toastId:r}=t;return{...e,toasts:e.toasts.map(e=>e.id===r||void 0===r?{...e,dismissed:!0,visible:!1}:e)};case 4:return void 0===t.toastId?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(e=>e.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let l=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(e=>({...e,pauseDuration:e.pauseDuration+l}))}}},M=[],$={toasts:[],pausedAt:void 0,settings:{toastLimit:20}},A={},z=(e,t=E)=>{A[t]=D(A[t]||$,e),M.forEach(([e,a])=>{e===t&&a(A[t])})},O=e=>Object.keys(A).forEach(t=>z(e,t)),I=e=>Object.keys(A).find(t=>A[t].toasts.some(t=>t.id===e)),L=(e=E)=>t=>{z(t,e)},T={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},Z=(e={},t=E)=>{let[a,s]=(0,o.useState)(A[t]||$),r=(0,o.useRef)(A[t]);(0,o.useEffect)(()=>(r.current!==A[t]&&s(A[t]),M.push([t,s]),()=>{let e=M.findIndex(([e])=>e===t);e>-1&&M.splice(e,1)}),[t]);let l=a.toasts.map(t=>{var a,s,r;return{...e,...e[t.type],...t,removeDelay:t.removeDelay||(null==(a=e[t.type])?void 0:a.removeDelay)||(null==e?void 0:e.removeDelay),duration:t.duration||(null==(s=e[t.type])?void 0:s.duration)||(null==e?void 0:e.duration)||T[t.type],style:{...e.style,...null==(r=e[t.type])?void 0:r.style,...t.style}}});return{...a,toasts:l}},S=(e,t="blank",a)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...a,id:(null==a?void 0:a.id)||w()}),P=e=>(t,a)=>{let s=S(t,e,a);return L(s.toasterId||I(s.id))({type:2,toast:s}),s.id},F=(e,t)=>P("blank")(e,t);F.error=P("error"),F.success=P("success"),F.loading=P("loading"),F.custom=P("custom"),F.dismiss=(e,t)=>{let a={type:3,toastId:e};t?L(t)(a):O(a)},F.dismissAll=e=>F.dismiss(void 0,e),F.remove=(e,t)=>{let a={type:4,toastId:e};t?L(t)(a):O(a)},F.removeAll=e=>F.remove(void 0,e),F.promise=(e,t,a)=>{let s=F.loading(t.loading,{...a,...null==a?void 0:a.loading});return"function"==typeof e&&(e=e()),e.then(e=>{let r=t.success?_(t.success,e):void 0;return r?F.success(r,{id:s,...a,...null==a?void 0:a.success}):F.dismiss(s),e}).catch(e=>{let r=t.error?_(t.error,e):void 0;r?F.error(r,{id:s,...a,...null==a?void 0:a.error}):F.dismiss(s)}),e};var V=1e3,R=(e,t="default")=>{let{toasts:a,pausedAt:s}=Z(e,t),r=(0,o.useRef)(new Map).current,l=(0,o.useCallback)((e,t=V)=>{if(r.has(e))return;let a=setTimeout(()=>{r.delete(e),n({type:4,toastId:e})},t);r.set(e,a)},[]);(0,o.useEffect)(()=>{if(s)return;let e=Date.now(),r=a.map(a=>{if(a.duration===1/0)return;let s=(a.duration||0)+a.pauseDuration-(e-a.createdAt);if(s<0){a.visible&&F.dismiss(a.id);return}return setTimeout(()=>F.dismiss(a.id,t),s)});return()=>{r.forEach(e=>e&&clearTimeout(e))}},[a,s,t]);let n=(0,o.useCallback)(L(t),[t]),i=(0,o.useCallback)(()=>{n({type:5,time:Date.now()})},[n]),c=(0,o.useCallback)((e,t)=>{n({type:1,toast:{id:e,height:t}})},[n]),d=(0,o.useCallback)(()=>{s&&n({type:6,time:Date.now()})},[s,n]),m=(0,o.useCallback)((e,t)=>{let{reverseOrder:s=!1,gutter:r=8,defaultPosition:l}=t||{},o=a.filter(t=>(t.position||l)===(e.position||l)&&t.height),n=o.findIndex(t=>t.id===e.id),i=o.filter((e,t)=>t<n&&e.visible).length;return o.filter(e=>e.visible).slice(...s?[i+1]:[0,i]).reduce((e,t)=>e+(t.height||0)+r,0)},[a]);return(0,o.useEffect)(()=>{a.forEach(e=>{if(e.dismissed)l(e.id,e.removeDelay);else{let t=r.get(e.id);t&&(clearTimeout(t),r.delete(e.id))}})},[a,l]),{toasts:a,handlers:{updateHeight:c,startPause:i,endPause:d,calculateOffset:m}}},H=j`
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
}`,B=j`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,U=N("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${H} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
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
    animation: ${B} 0.15s ease-out forwards;
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
`,Y=N("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${X} 1s linear infinite;
`,G=j`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,J=j`
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
}`,K=N("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${G} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${J} 0.2s ease-out forwards;
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
`,Q=N("div")`
  position: absolute;
`,W=N("div")`
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
`,ea=({toast:e})=>{let{icon:t,type:a,iconTheme:s}=e;return void 0!==t?"string"==typeof t?o.createElement(et,null,t):t:"blank"===a?null:o.createElement(W,null,o.createElement(Y,{...s}),"loading"!==a&&o.createElement(Q,null,"error"===a?o.createElement(U,{...s}):o.createElement(K,{...s})))},es=e=>`
0% {transform: translate3d(0,${-200*e}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,er=e=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${-150*e}%,-1px) scale(.6); opacity:0;}
`,el=N("div")`
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
`,eo=N("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,en=(e,t)=>{let a=e.includes("top")?1:-1,[s,r]=C()?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[es(a),er(a)];return{animation:t?`${j(s)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${j(r)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},ei=o.memo(({toast:e,position:t,style:a,children:s})=>{let r=e.height?en(e.position||t||"top-center",e.visible):{opacity:0},l=o.createElement(ea,{toast:e}),n=o.createElement(eo,{...e.ariaProps},_(e.message,e));return o.createElement(el,{className:e.className,style:{...r,...a,...e.style}},"function"==typeof s?s({icon:l,message:n}):o.createElement(o.Fragment,null,l,n))});l=o.createElement,x.p=void 0,g=l,y=void 0,v=void 0;var ec=({id:e,className:t,style:a,onHeightUpdate:s,children:r})=>{let l=o.useCallback(t=>{if(t){let a=()=>{s(e,t.getBoundingClientRect().height)};a(),new MutationObserver(a).observe(t,{subtree:!0,childList:!0,characterData:!0})}},[e,s]);return o.createElement("div",{ref:l,className:t,style:a},r)},ed=(e,t)=>{let a=e.includes("top"),s=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:C()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(a?1:-1)}px)`,...a?{top:0}:{bottom:0},...s}},em=b`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,ex=({reverseOrder:e,position:t="top-center",toastOptions:a,gutter:s,children:r,toasterId:l,containerStyle:n,containerClassName:i})=>{let{toasts:c,handlers:d}=R(a,l);return o.createElement("div",{"data-rht-toaster":l||"",style:{position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none",...n},className:i,onMouseEnter:d.startPause,onMouseLeave:d.endPause},c.map(a=>{let l=a.position||t,n=ed(l,d.calculateOffset(a,{reverseOrder:e,gutter:s,defaultPosition:t}));return o.createElement(ec,{id:a.id,key:a.id,onHeightUpdate:d.updateHeight,className:a.visible?em:"",style:n},"custom"===a.type?_(a.message,a):r?r(a):o.createElement(ei,{toast:a,position:l}))}))},ep=F}}]);