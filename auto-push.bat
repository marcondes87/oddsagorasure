@echo off
cd /d "%~dp0"
:loop
echo [%date% %time%] Buscando dados...
node push-to-render.js
echo [%date% %time%] Aguardando 5 minutos...
timeout /t 120 /nobreak
goto loop
