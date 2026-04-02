@echo off
cd /d "%~dp0"
echo 🚀 INICIANDO NEXUS REPORT...
echo.

::Verificação de instalação do Node.js
node -v >nul  2>&1
if errorlevel 1(
    echo ❌ Node.js não instalado.
    echo Baixe em: https://nodejs.org/
    pause
    exit /b 1
)

::Verificação de .env
if not exist ".env" (
    echo ❌ .env não encontrado.
    echo.
    echo Passos:
    echo 1. Copie .env
    echo 2. Preencha o .env com suas credenciais do SQL server
    echo 3. Execute a .bat novamente
    pause
    exit /b 1
)

::Instalação de dependências
if not exist "node_modules" (
    echo 📦 Instalando dependências...
    call npm install
)

::Iniciar servidor
echo ✅ Servidor iniciando na porta 3000...
echo.
echo 🌐 Abrindo navegador automaticamente...
echo.
timeout /t 2 >nul

::Abrir navegador
start http://localhost:3000

echo ✅ Navegador aberto! Servidor em execução...
echo.

node server.js
pause