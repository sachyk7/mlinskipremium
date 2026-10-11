@echo off
rem Local preview of the website (needs Node.js). Opens http://localhost:5175 in your browser.
cd /d "%~dp0"
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5175"
node server.cjs
pause
