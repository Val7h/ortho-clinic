@echo off
rem Impressora OrthoMedic - Clinica Mario Bento (Palmares), clinic_id=5
rem Abre a pagina /impressora num Chrome separado, que imprime direto na
rem impressora padrao do Windows (--kiosk-printing), sem janela de impressao.
rem Para outra clinica, troque o numero no fim do endereco (clinic_id=5).

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Nao achei o Google Chrome neste computador. Instale o Chrome e tente de novo.
  pause
  exit /b 1
)

start "" "%CHROME%" --user-data-dir="%LOCALAPPDATA%\OrthoMedicImpressora" --no-first-run --kiosk-printing --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --app=https://ortho-clinic-ldcd.onrender.com/impressora?clinic_id=5
