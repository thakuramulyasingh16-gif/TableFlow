@echo off
setlocal EnableExtensions

set PORT=3000
set START_PATH=/login
set FALLBACK_DIR=C:\Amulya's Projects\TableFlow

:: 1. Directory verification
cd /d "%~dp0"
if exist "package.json" goto CheckTools
if exist "%FALLBACK_DIR%\package.json" (
    cd /d "%FALLBACK_DIR%"
    goto CheckTools
)
echo [ERROR] TableFlow directory not found.
echo Could not locate package.json in "%~dp0" or "%FALLBACK_DIR%".
echo Please run this script from the TableFlow project directory.
pause
exit /b 1

:CheckTools
:: 2. Check Node and npm
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in your PATH.
    echo Please install Node.js 20 or higher from: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found in your PATH.
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

set NODE_MAJOR=
for /f "tokens=1 delims=." %%v in ('node -e "console.log(process.versions.node)" 2^>nul') do set NODE_MAJOR=%%v
if defined NODE_MAJOR (
    if %NODE_MAJOR% lss 20 (
        echo [WARNING] Node.js version is %NODE_MAJOR%. TableFlow recommends Node.js 20 or higher.
    )
)

:CheckRunningApp
:: 3. Check if app is already running
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri ('http://localhost:' + $env:PORT + $env:START_PATH) -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
    echo TableFlow is already running at http://localhost:%PORT%%START_PATH%
    echo Opening browser...
    start "" "http://localhost:%PORT%%START_PATH%"
    exit /b 0
)

:CheckPortConflict
:: 4. Check if port is in use by another process
set PORT_PID=
for /f "tokens=5" %%a in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    set PORT_PID=%%a
)

if not defined PORT_PID goto CheckDeps

echo Port %PORT% is currently in use by process ID %PORT_PID%:
echo.
tasklist /FI "PID eq %PORT_PID%"
echo.
choice /C YN /M "Port %PORT% is in use. Do you want to stop this process?"
if errorlevel 2 (
    echo Port %PORT% is required to run TableFlow.
    echo Please free port %PORT% or choose Y next time to stop it.
    pause
    exit /b 1
)

echo Stopping process %PORT_PID% and child processes...
taskkill /PID %PORT_PID% /T /F >nul 2>nul
ping 127.0.0.1 -n 3 >nul

:CheckDeps
:: 5. Check dependencies and Prisma client
if exist "node_modules\" goto CheckPrisma
echo [INFO] node_modules folder missing. Installing dependencies...
if exist "package-lock.json" (
    call npm ci
) else (
    call npm install
)
if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

:CheckPrisma
if exist "node_modules\.prisma\client\" goto CheckEnv
echo [INFO] Prisma client missing. Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
    echo [ERROR] Prisma client generation failed.
    pause
    exit /b 1
)

:CheckEnv
:: 6. Check .env
if exist ".env" goto StartOpener
echo [INFO] .env file not found. Running first-time setup...
call npm run setup
if errorlevel 1 (
    echo [ERROR] Initial setup failed. Please check the logs above.
    pause
    exit /b 1
)
echo.
echo IMPORTANT: If demo passwords were displayed above, copy them now.
echo They will not be displayed again.
echo.
pause

:StartOpener
:: 7. Background browser opener
start "" /b powershell -WindowStyle Hidden -NoProfile -Command "$url = 'http://localhost:%PORT%%START_PATH%'; for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Seconds 2; try { $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($res.StatusCode -eq 200) { Start-Process $url; break; } } catch {} }"

:: 8. Start server in foreground
echo.
echo ======================================================================
echo Starting TableFlow server...
echo URL: http://localhost:%PORT%%START_PATH%
echo Note: Closing this window will stop the server.
echo ======================================================================
echo.

call npm run dev
set SERVER_EXIT_CODE=%ERRORLEVEL%

:: 9. Exit report
echo.
echo TableFlow server stopped with exit code %SERVER_EXIT_CODE%.
pause
exit /b %SERVER_EXIT_CODE%
