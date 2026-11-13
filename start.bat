@echo off
setlocal enabledelayedexpansion
title TableFlow - Dev Server

echo ======================================================================
echo                   TableFlow Restaurant System                         
echo ======================================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not found in PATH.
  echo Please install Node.js 20 or higher from https://nodejs.org/
  pause
  exit /b 1
)

:: 2. Check if .env exists, run setup if missing
if not exist "%~dp0.env" (
  echo [.env missing] First-time setup detected. Running full setup...
  call npm.cmd run setup
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Initial setup failed. Please review the output above.
    pause
    exit /b 1
  )
)

:: 3. Run Preflight Check
echo Running preflight checks...
node "%~dp0scripts\preflight.mjs"
if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] Preflight checks failed. Dev server not started.
  pause
  exit /b 1
)

:: 4. Launch browser in background after short delay
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"

:: 5. Start dev server (predev is already integrated into npm run dev)
echo.
echo Starting Next.js Dev Server...
echo Press Ctrl+C in this window to stop the server.
echo.
call npm.cmd run dev

if %ERRORLEVEL% neq 0 (
  echo.
  echo Dev server exited with an error.
  pause
)
