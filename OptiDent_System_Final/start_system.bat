@echo off
title OptiDent Dental Clinic Management System - Presentation Server
color 0B
echo ============================================================
echo   OPTIDENT DENTAL CLINIC MANAGEMENT SYSTEM (FINAL RELEASE)
echo ============================================================
echo.
echo Starting Production Server on http://localhost:3000 ...
echo Database: Native MongoDB (with offline JSON fallback)
echo.
start "" http://localhost:3000
node server.js
pause

