@echo off
setlocal
set "BACKEND_PORT=%~1"
if "%BACKEND_PORT%"=="" set "BACKEND_PORT=3001"

start "MusicStats Server" cmd /k "cd /d %~dp0 && set PORT=%BACKEND_PORT% && npm run server"
start "MusicStats Client" cmd /k "cd /d %~dp0src\client && set HOST=0.0.0.0 && set REACT_APP_API_PORT=%BACKEND_PORT% && npm start"
