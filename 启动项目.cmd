@echo off
cd /d "%~dp0"
if not exist "node_modules" call npm.cmd ci
if errorlevel 1 goto end
call npm.cmd run start
:end
pause
