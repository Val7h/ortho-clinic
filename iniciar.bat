@echo off
echo.
echo  ============================================
echo    OrthoClinic — Iniciando sistema...
echo  ============================================
echo.
cd /d "%~dp0"
docker compose up --build -d
echo.
echo  Sistema iniciando...
echo  Aguarde 30-60 segundos e acesse:
echo.
echo    Frontend:  http://localhost:3002
echo    API Docs:  http://localhost:8002/docs
echo.
echo  Para parar: docker compose down
pause
