# 更新日志

## v1.0.5 - 2026-03-26

- 桌面端完全切换到 `Tauri`
- 删除旧的 `Electron` 主进程、`preload`、IPC 桥和专用打包配置
- 前端桌面调用统一收敛到 `src/renderer/lib/desktop.ts`
- 清理遗留的 Electron 文档、脚本和内部规格说明
- 保留并验证 `pnpm test`、`pnpm run build:web`、`pnpm tauri build --debug --no-bundle` 工作流
