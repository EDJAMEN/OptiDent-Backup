@echo off
title OptiDent Dental System - Fullstack Node.js + MongoDB
color 0b
echo ======================================================================
echo           OPTIDENT DENTAL CLINIC MANAGEMENT SYSTEM
echo          Fullstack Pure JavaScript (Node.js + MongoDB)
echo ======================================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Node.js runtime...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js from https://nodejs.org
    pause
    exit /b
)

echo [2/3] Checking dependencies...
if not exist "node_modules" (
    echo Installing node dependencies...
    call npm install
)

echo [3/3] Launching OptiDent Node.js Server on port 3000...
echo.
echo Application will be live at: http://localhost:3000
echo.
echo Press Ctrl+C at any time to stop the server.
echo ======================================================================
node server.js
pause

