# Tauri 迁移说明

## 结论

当前仓库只保留 `Tauri` 实现：

- `Electron` 主进程源码已删除
- 渲染层不再检测或回退到 `window.electronAPI`
- 打包入口统一为 `tauri build`

## 架构

- `src/renderer/lib/desktop.ts`：前端唯一桌面能力入口
- `src-tauri/src/lib.rs`：命令注册、窗口事件、状态装配
- `src-tauri/src/process_manager.rs`：子进程启动、输出批量推送、URL 检测
- `src-tauri/src/storage.rs`：历史记录与设置持久化
- `src-tauri/src/config.rs`：项目配置加载与校验

## 已清理内容

- `src/main/` 整个 Electron 主进程目录
- `tsconfig.main.json`
- `package.json` 中 Electron 相关脚本、依赖和打包配置
- Electron 专用验证脚本、构建脚本和历史文档

## 验证命令

```bash
pnpm test
pnpm run build:web
pnpm tauri build --debug --no-bundle
```
