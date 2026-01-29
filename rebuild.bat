@echo off
echo 正在关闭所有 Electron 进程...
taskkill /F /IM "自动开发服务器启动工具.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul
timeout /t 3 /nobreak >nul

echo 正在删除旧的打包文件...
rmdir /s /q release 2>nul
rmdir /s /q dist 2>nul

echo 正在重新打包...
call pnpm run package:win

echo.
echo 打包完成！
echo 可执行文件位置：release\win-unpacked\自动开发服务器启动工具.exe
echo 安装程序位置：release\自动开发服务器启动工具 Setup 1.0.0.exe
pause
