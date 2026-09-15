@echo off
setlocal

cd /d H:\Development\MusicStats

start "MusicStats Server" cmd /k "set PORT=3002&& npm run server"
start "MusicStats Client" cmd /k "cd src\client&& set HOST=0.0.0.0&& set PORT=3003&& set REACT_APP_API_PORT=3002&& npm start"

endlocal
