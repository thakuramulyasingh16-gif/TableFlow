@echo off
setlocal EnableExtensions

set PORT=3000
set FALLBACK_DIR=C:\Amulya's Projects\TableFlow

:: 1. Directory verification
cd /d "%~dp0"
if exist "package.json" goto CheckPort
if exist "%FALLBACK_DIR%\package.json" (
    cd /d "%FALLBACK_DIR%"
    goto CheckPort
)

:CheckPort
echo Checking for process listening on port %PORT%...

set TARGET_PID=
for /f "tokens=5" %%a in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    set TARGET_PID=%%a
)

if not defined TARGET_PID (
    echo No process found listening on port %PORT%.
    echo TableFlow is not currently running.
    pause
    exit /b 0
)

echo Found process listening on port %PORT% with PID %TARGET_PID%:
echo.
tasklist /FI "PID eq %TARGET_PID%"
echo.

choice /C YN /M "Are you sure you want to stop this process?"
if errorlevel 2 (
    echo Operation cancelled. Process %TARGET_PID% was not stopped.
    pause
    exit /b 0
)

echo Stopping process %TARGET_PID% and child processes...
taskkill /PID %TARGET_PID% /T /F
if errorlevel 1 (
    echo [ERROR] Failed to stop process %TARGET_PID%.
    pause
    exit /b 1
)

echo Process stopped successfully. Port %PORT% is now free.
pause
exit /b 0
