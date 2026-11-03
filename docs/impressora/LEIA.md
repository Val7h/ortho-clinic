# Impressora da clínica — como instalar

Este computador vai imprimir sozinho os documentos que o Dr. Valth mandar
(receita, pedido de exame, laudo, atestado, encaminhamento). Ninguém precisa clicar.

Clínica deste atalho: **Clínica Mário Bento — Palmares** (número 5).

## 1. Escolher a impressora padrão (uma vez só)

1. Abra **Iniciar → Configurações → Bluetooth e dispositivos → Impressoras e scanners**.
2. **Desligue** a opção "Permitir que o Windows gerencie minha impressora padrão".
3. Clique na impressora da clínica → **Definir como padrão**.
4. Em **Preferências de impressão**, deixe papel **A4**.

## 2. Colocar o atalho (uma vez só)

1. Copie o arquivo **`Impressora OrthoMedic - Palmares.bat`** para a Área de Trabalho.
2. Dê dois cliques nele. Abre uma janela do Chrome só com a página da impressora.
3. Na primeira vez, a página pede para **entrar**. Entre com o usuário da clínica.
4. Depois de entrar, **feche a janela** e abra de novo pelo atalho.
   Deve aparecer, em verde: **"Ligada — esperando documentos"**.

Para abrir sozinho quando o computador ligar: aperte `Windows + R`, digite
`shell:startup`, Enter, e copie o mesmo arquivo `.bat` para a pasta que abrir.

Se preferir um atalho (`.lnk`) em vez do `.bat`: botão direito na Área de Trabalho →
**Novo → Atalho**, e cole no destino:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\OrthoMedicImpressora" --no-first-run --kiosk-printing --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --app=https://ortho-clinic-ldcd.onrender.com/impressora?clinic_id=5
```

Nome do atalho: **Impressora OrthoMedic**.

## 3. No dia a dia

- **Deixe a janela aberta.** Pode ficar atrás de outras janelas. **Não feche e não minimize.**
- Mantenha a impressora **ligada e com papel**.
- Se aparecer **"Sem conexão"** em vermelho: confira a internet. A página tenta de novo sozinha.
- Documento mandado há mais de 24 horas e não impresso sai da fila sem imprimir
  (para o computador não despejar papel velho quando religar).

## Por que um Chrome separado?

O atalho abre o Chrome com uma pasta própria (`OrthoMedicImpressora`). Assim a
impressão direta (`--kiosk-printing`) funciona mesmo que outro Chrome já esteja
aberto no computador. Esse Chrome separado guarda o login da clínica.

## Outra clínica

Troque o número no fim do endereço (`clinic_id=5`) pelo número da outra clínica.
Sem número, a página mostra os botões para escolher a clínica.
