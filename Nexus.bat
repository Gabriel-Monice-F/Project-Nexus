@echo off
chcp 65001 >nul
cls
cd /d "%~dp0"

color 0A
echo.
echo ╔═══════════════════════════════════╗
echo ║   🚀 NEXUS REPORT - INICIANDO     ║
echo ╚═══════════════════════════════════╝
echo.

setlocal enabledelayedexpansion

::Verificação de instalação do Node.js
echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo ❌ ERRO: Node.js não está instalado!
    echo.
    echo Solução:
    echo 1. Baixe Node.js em: https://nodejs.org/
    echo 2. Instale marcando "Add to PATH"
    echo 3. Reinicie o computador
    echo 4. Execute este arquivo novamente
    echo.
    pause
    exit /b 1
)
echo ✅ Node.js encontrado
echo.

::Verificação de .env
echo [2/5] Verificando arquivo .env...
if not exist ".env" (
    color 0C
    echo.
    echo ❌ ERRO: Arquivo .env não encontrado!
    echo.
    echo Solução:
    echo 1. Abra a pasta do projeto
    echo 2. Copie o arquivo ".env.example"
    echo 3. Renomeie a cópia para ".env"
    echo 4. Abra o arquivo .env com Bloco de Notas
    echo 5. Preencha com seus dados do SQL Server:
    echo    - DB_USER=seu_usuario
    echo    - DB_PASS=sua_senha
    echo    - DB_SERVER=seu_ip_ou_servidor
    echo    - DB_NAME=nome_do_banco
    echo 6. Salve e execute este arquivo novamente
    echo.
    pause
    exit /b 1
)
echo ✅ Arquivo .env encontrado
echo.

::Instalação de dependências
echo [3/5] Verificando dependências (npm packages)...
if not exist "node_modules" (
    echo 📦 Instalando... Isso pode levar 1-2 minutos...
    echo.
    call npm install
    if errorlevel 1 (
        color 0C
        echo.
        echo ❌ ERRO ao instalar dependências!
        echo.
        echo Solução:
        echo 1. Verifique sua conexão com a internet
        echo 2. Tente executar novamente
        echo 3. Se persistir, abra PowerShell como Administrador e execute:
        echo    npm cache clean --force
        echo    npm install
        echo.
        pause
        exit /b 1
    )
) else (
    echo ✅ Dependências já instaladas
)
echo.

::Iniciar servidor
echo [4/5] Iniciando servidor...
echo ✅ Servidor iniciando na porta 3000...
echo.
timeout /t 2 >nul

::Abrir navegador
echo [5/5] Abrindo navegador...
echo 🌐 Abrindo http://localhost:3000...
echo.
start http://localhost:3000

echo ═══════════════════════════════════
echo ✅ SERVIDOR INICIADO COM SUCESSO!
echo ═══════════════════════════════════
echo.
echo 📍 URL: http://localhost:3000
echo.
echo ⚠️  NÃO feche esta janela enquanto usar o Nexus!
echo.
echo Pressione Ctrl+C para parar o servidor
echo.

timeout /t 2 >nul
node server.js
if errorlevel 1 (
    color 0C
    echo.
    echo ❌ ERRO ao iniciar servidor!
    echo.
    echo Motivos comuns:
    echo - Credenciais SQL Server incorretas (verifique .env)
    echo - Banco de dados offline ou inacessível
    echo - Problema de conexão de rede
    echo.
    echo Verifique o .env e tente novamente!
    echo.
)
pause