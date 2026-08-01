@echo off
title IA GOV MT - Instalacao
cd /d %~dp0backend

echo ============================================
echo   IA GOV MT - Instalando dependencias
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no seu computador.
    echo Baixe e instale em: https://nodejs.org/ ^(versao LTS^)
    echo Depois rode este arquivo novamente.
    pause
    exit /b 1
)

call npm install

echo.
echo ============================================
echo   Instalacao concluida!
echo   Agora use o arquivo "iniciar.bat" para rodar.
echo ============================================
pause
