@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this project.
  pause
  exit /b 1
)
echo Keep this window open while viewing the museum.
node server.cjs --open
pause
