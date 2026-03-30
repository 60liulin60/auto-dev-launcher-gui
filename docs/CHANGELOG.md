# 更新日志

## v2.0.0 - 2026-03-30

- 版本升级到 `2.0.0`（`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`）
- 重写并同步 `README.md`，修复乱码并对齐当前实现与脚本命令
- 统一打包示例文件名为 `Auto Dev Launcher_2.0.0_x64-setup.exe`

## v1.0.6 - 2026-03-27

- 新增「开机自启」设置（Windows）
- 新增「点击关闭最小化到托盘」设置
- 新增托盘右键菜单（显示主窗口、退出）
- 托盘退出时先停止所有已启动项目，再安全退出应用

## v1.0.5 - 2026-03-26

- 桌面端完全切换到 `Tauri`
- 移除旧的 Electron 主进程、preload、IPC 桥接与专用打包配置
- 统一前端桌面调用到 `src/renderer/lib/desktop.ts`
- 保留并验证 `pnpm test`、`pnpm run build:web`、`pnpm tauri build --debug --no-bundle` 工作流