@echo off
rem Starts the local GamerHoard web app (http://127.0.0.1:5207) over the shared library.
rem Optional: set RAWG_API_KEY before running to enable the game catalogue.
cd /d "%~dp0"
if not exist server\node_modules call npm install --prefix server
if not exist apps\mobile\dist\index.html (
  if not exist node_modules call npm install
  call npm run build:web
)
start "" "http://127.0.0.1:5207"
node server\index.mjs
pause
