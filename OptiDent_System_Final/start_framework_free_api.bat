@echo off
title OptiDent Framework-Free RESTful API Server
color 0A
echo ============================================================
echo   OPTIDENT FRAMEWORK-FREE RESTFUL API (NATIVE NODE.JS CORE)
echo ============================================================
echo.
echo Starting Framework-Free Server on http://localhost:3001 ...
echo OpenAPI Spec: http://localhost:3001/openapi.yaml
echo.
cd framework_free_api
start "" http://localhost:3001/openapi.yaml
node server.js
pause

