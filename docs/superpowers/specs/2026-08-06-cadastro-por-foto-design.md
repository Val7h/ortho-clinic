# Cadastro de paciente por foto (OCR por IA)

Data: 06/08/2026
Autor: Claude, a pedido do Dr. Valth
Status: aprovado — segue para plano de implementação

## O problema

As secretárias cadastram cada paciente **duas vezes**: no sistema da clínica
onde já trabalhavam e no OrthoClinic. É trabalho dobrado, e está cansando.

Elas já ficam com o WhatsApp Web aberto. A ideia do Valth: tirar uma foto (ou
print) da ficha no outro sistema, mandar para o WhatsApp, e no WhatsApp Web
copiar a imagem e colar numa aba do OrthoClinic. A IA lê e o cadastro nasce
sozinho.

## Decisões fechadas com o Valth

| Pergunta | Decisão |
|---|---|
| O que é colado | A ficha de **um** paciente por vez |
| Falta dado obrigatório | **Salva assim mesmo**, marcado como cadastro incompleto |
| Enviar imagem com dado de paciente para a IA | **Autorizado**, e a imagem **não é guardada** |
| Onde fica | Tela própria dentro de Pacientes |

O terceiro item é o mais importante: a imagem vai para a API da Anthropic, é
lida, os campos voltam e a imagem é descartada. Não é gravada no banco, em
disco, nem em log.

## Por que IA e não OCR tradicional

O app já fala com a Claude pelo backend (`backend/routers/chat.py`, mesma
`ANTHROPIC_API_KEY`). Não entra fornecedor novo, chave nova nem custo novo de
administrar — e isso importa porque o Valth não constrói o que exige
manutenção recorrente.

Tesseract rodando no próprio servidor foi considerado e descartado: erra
demais em print de tela (troca dígito de CPF, quebra endereço), e a correção
manual comeria o ganho que justifica a tela.

## Escopo

### O que entra

**A tela** (`/pacientes/foto`, botão na listagem de pacientes):
uma área grande *"Cole aqui o print da ficha — Ctrl+V"*. Aceita colar
(clipboard), arrastar arquivo e escolher arquivo (no celular vira tirar foto).
Colou → miniatura + botão **Ler ficha**.

**A leitura:** a imagem vai ao backend, que chama a Claude pedindo os campos em
JSON. Campo que não estiver no print volta nulo.

**A conferência:** o formulário de paciente aparece preenchido, com os campos
lidos destacados. A secretária corrige e salva.

**Trava de duplicata:** antes de salvar, procura CPF igual, ou nome igual com
a mesma data de nascimento. Se achar, oferece abrir a ficha existente ou
atualizar a ficha com o que veio do print. Sem isso a tela vira uma fábrica de
pacientes repetidos — o problema Victor/Vytor que já aconteceu.

**Trava de CPF:** confere o dígito verificador. Não fechou, campo em vermelho
com "CPF não confere — verifique". Erro de leitura vira aviso na tela, não
dado sujo no banco.

### O que NÃO entra

- Print com **lista** de vários pacientes.
- Importação em lote da base antiga.
- Guardar a imagem em qualquer lugar.
- Cadastro por foto no bot do WhatsApp (o bot atende paciente; comando de
  funcionária ali é risco de um paciente cadastrar alguém sem querer).

## Contrato do backend

Endpoint novo: `POST /patients/ler-foto`

Recebe `multipart/form-data` com o arquivo de imagem. Papel: qualquer usuário
autenticado — **a secretária precisa usar**, então não repete o bloqueio de
`role == "secretary"` que existe no chat.

Limites: imagem de no máximo **6 MB**, tipos `image/png`, `image/jpeg`,
`image/webp`. Fora disso, 422 com mensagem em português.

Resposta:

```jsonc
{
  "campos": {
    "name": "MARIA DA SILVA",          // ou null
    "cpf": "12345678900",
    "birthdate": "1963-11-29",         // ISO; null se ilegível
    "phone": "83991535364",
    "address_street": "Rua Antonio Borges, 120",
    "address_neighborhood": "Centro",
    "address_city": "Lagoa Seca",
    "address_state": "PE",
    "address_zip": "58117000",
    "insurance": "GEAP",               // ou "Particular"
    "insurance_number": "0123456789"
  },
  "cpf_valido": true,                  // dígito verificador; null se não veio CPF
  "lidos": ["name", "cpf", "phone"],   // quais campos a IA achou
  "aviso": null                        // texto em português, quando algo deu errado
}
```

O endpoint **não grava nada**. Quem cria o paciente continua sendo o
`POST /patients` que já existe.

### O prompt

Instrução fechada: devolver SOMENTE o JSON dos campos, sem texto em volta;
usar `null` para o que não estiver visível; **nunca inventar nem completar**
dado que não esteja na imagem. Nome em caixa alta (padrão do app). CPF e
telefone só com dígitos. Data em ISO. UF com duas letras.

A regra de não inventar é a que mais importa: um CPF plausível porém inventado
é pior que um campo vazio.

### Segurança e sigilo

- A imagem vive só na memória do processo durante a chamada; nada em disco,
  banco ou log.
- Nada da imagem entra em log de erro — o log registra tipo de exceção e
  tamanho, nunca conteúdo.
- Mesmo cuidado já adotado no chat: `str(exc)` de erro de rede nunca é logado
  (pode embutir a API key).

## Frontend

Arquivo novo `frontend/app/pacientes/foto/page.tsx`, e um botão
"Cadastrar por foto" na listagem de pacientes ao lado de "Novo paciente".

A área de colagem escuta `paste` na janela e lê `event.clipboardData.files`.
Também aceita `drop` e `<input type="file" accept="image/*" capture>`.

Depois da leitura, reaproveita o mesmo formulário do cadastro manual — mesmos
campos, mesma busca de CEP, mesma composição de endereço — para não haver duas
telas de cadastro divergindo com o tempo.

## Riscos assumidos

1. **A leitura não acerta sempre.** Fonte pequena, foto tremida ou tela escura
   degradam o resultado. A meta é corrigir um ou dois campos em vez de digitar
   quinze. Se na prática ela corrigir metade, a abordagem está errada e é
   melhor descobrir rápido.
2. **Continua sendo dois cadastros.** Isso reduz o segundo de ~3 minutos para
   ~15 segundos; não elimina. Se o outro sistema exportar planilha, a
   importação seria perfeita e resolveria também os pacientes antigos — vale
   perguntar a quem administra o outro sistema.
3. **Custo por leitura:** menos de R$ 0,10 por ficha. Cem cadastros por mês
   ficam perto de R$ 5.

## Critérios de aceite

- Colar um print no Ctrl+V mostra a miniatura sem recarregar a página.
- "Ler ficha" devolve os campos e preenche o formulário, destacando o que veio
  da imagem.
- Campo ausente no print fica vazio — nunca preenchido por chute.
- CPF com dígito verificador inválido aparece em vermelho com aviso.
- Paciente com CPF já cadastrado dispara o aviso de duplicata antes de salvar.
- Salvar sem os obrigatórios funciona e o paciente fica marcado como
  cadastro incompleto.
- Arquivo acima de 6 MB ou tipo não suportado devolve mensagem em português,
  sem quebrar a tela.
- Nenhuma imagem aparece no banco, em disco ou em log após a operação.
