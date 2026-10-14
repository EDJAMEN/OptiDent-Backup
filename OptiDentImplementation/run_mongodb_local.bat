@echo off
title OptiDent MongoDB Server
echo ========================================================
echo Starting OptiDent MongoDB Server on 127.0.0.1:27017...
echo ========================================================
if exist "c:\Users\User\Documents\SIA\OptiDent_System\mongodb_data\mongod.lock" (
    echo Clearing stale lock file...
    del /f /q "c:\Users\User\Documents\SIA\OptiDent_System\mongodb_data\mongod.lock" >nul 2>&1
)
"C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "c:\Users\User\Documents\SIA\OptiDent_System\mongodb_data" --bind_ip 127.0.0.1 --port 27017
pause
