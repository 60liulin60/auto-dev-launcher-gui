@echo off
echo 正在关闭已运行的应用...
taskkill /F /IM "自动开发服务器启动工具.exe" 2>nul
timeout /t 2 /nobreak >nul

echo 正在重新打包 Tauri Windows 安装包...
call pnpm run package:win

echo.
echo 打包完成。
echo 安装包目录：src-tauri\target\release\bundle\nsis\
pause
