@echo off
setlocal
cd /d "%~dp0"
title MapleVault Launcher
color 0a

echo ========================================================
echo                    MAPLEVAULT LAUNCHER
echo ========================================================
echo Proyecto: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js LTS y vuelve a ejecutar este launcher.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm no esta instalado o no esta en PATH.
  echo Instala Node.js LTS y vuelve a ejecutar este launcher.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] No se encontro node_modules en la raiz.
  choice /C SN /N /M "Instalar dependencias ahora? [S/N]: "
  if errorlevel 2 goto end
  npm install
  if errorlevel 1 goto fail
)

echo Selecciona una opcion:
echo.
echo [1] Iniciar MapleVault en modo desarrollo
echo     Backend + Frontend Vite + Electron
echo.
echo [2] Compilar MapleVault
echo     Genera app/backend/dist, app/frontend/dist y dist/desktop
echo.
echo [3] Validar codigo
echo     Typecheck + lint frontend + tests de seguridad
echo.
echo [4] Empaquetar instalador
echo     Build completo + electron-builder
echo.
echo [5] Preparar LibreTranslate
echo     Instala/actualiza el traductor local usado por MapleVault
echo.
choice /C 12345 /N /M "Opcion [1-5]: "

if errorlevel 5 goto setup_translate
if errorlevel 4 goto package
if errorlevel 3 goto check
if errorlevel 2 goto build
if errorlevel 1 goto dev

:dev
echo.
echo [RUN] Iniciando MapleVault...
echo Mantene esta ventana abierta mientras uses la aplicacion.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\stop-maplevault-dev-ports.ps1"
if errorlevel 1 goto fail
npm run dev
goto finish

:build
echo.
echo [RUN] Compilando MapleVault...
npm run build
goto finish

:check
echo.
echo [RUN] Validando MapleVault...
npm run check
goto finish

:package
echo.
echo [RUN] Empaquetando MapleVault...
npm run package
goto finish

:setup_translate
echo.
echo [RUN] Preparando LibreTranslate local...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup-libretranslate.ps1"
goto finish

:fail
echo.
echo [ERROR] El comando fallo. Revisa la salida anterior.
pause
exit /b 1

:finish
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] El proceso termino con codigo %EXIT_CODE%.
) else (
  echo.
  echo [OK] Proceso finalizado correctamente.
)
pause
exit /b %EXIT_CODE%

:end
echo.
echo Operacion cancelada.
pause
exit /b 0
