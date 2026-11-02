@echo off
:: Batch script to start MongoDB Service with Administrator elevation
echo Checking administrator privileges...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to start MongoDB Service...
    powershell -Command "Start-Process cmd -ArgumentList '/c net start MongoDB && echo MongoDB is now running! && pause' -Verb RunAs"
    exit /b
)

net start MongoDB
if %errorLevel% equ 0 (
    echo.
    echo ========================================================
    echo MongoDB Service is RUNNING!
    echo You can now connect with MongoDB Compass at:
    echo mongodb://localhost:27017
    echo ========================================================
) else (
    echo Failed to start MongoDB. Please check services.msc.
)
pause
