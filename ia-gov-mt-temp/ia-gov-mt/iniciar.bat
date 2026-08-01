@echo off
title IA GOV MT
cd /d %~dp0backend

if not exist node_modules (
    echo Dependencias nao instaladas ainda.
    echo Rode primeiro o arquivo "instalar.bat".
    pause
    exit /b 1
)

echo ============================================
echo   Iniciando IA GOV MT
echo   Lembre-se: o LM Studio precisa estar aberto
echo   com o servidor local ligado ^(porta 1234^).
echo ============================================
echo.

start "" http://localhost:3000
node server.js

pause
