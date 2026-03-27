@echo off
echo Stopping running app...
taskkill /F /IM "auto-dev-launcher-gui.exe" 2>nul
timeout /t 2 /nobreak >nul

echo Rebuilding Tauri Windows installer...
call pnpm run package:win

echo.
echo Build completed.
echo Installer output: release-packages\
pause
