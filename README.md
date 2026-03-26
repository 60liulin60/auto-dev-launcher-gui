# 自动开发服务器启动工具

> 基于 `Tauri + React` 的桌面应用，用来统一管理和启动本地开发服务。

![界面预览](docs/image.png)

## 当前状态

- 桌面端已经完全迁移到 `Tauri`
- 旧的 `Electron` 主进程、`preload`、IPC 桥接和打包配置已移除
- 前端只通过 `src/renderer/lib/desktop.ts` 调用桌面能力

## 功能概览

- 自动读取 `package.json` / `dev-config.json`
- 自动识别包管理器并启动开发命令
- 管理多个项目实例与历史记录
- 实时展示日志并识别可点击的本地地址
- 关闭应用或移除项目时自动停止相关进程

## 技术栈

- `Tauri 2`
- `React 19`
- `Vite 7`
- `Rust`（进程管理、配置加载、历史持久化）

## 开发环境

- `Node.js 20+`
- `pnpm`
- `Rust` 与 `cargo`

如果 Windows 下执行 `pnpm tauri build` 提示找不到 `cargo`，先把 `%USERPROFILE%\\.cargo\\bin` 加到 `PATH`。

## 常用命令

```bash
pnpm install
pnpm run dev
pnpm test
pnpm run build:web
pnpm run package:win
```

调试构建：

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
pnpm tauri build --debug --no-bundle
```

## 打包输出

- 调试可执行文件：`src-tauri/target/debug/auto-dev-launcher-gui.exe`
- Windows 安装包目录：`src-tauri/target/release/bundle/nsis/`

## 目录结构

```text
src/
  renderer/
    components/        React 组件
    contexts/          全局状态
    lib/desktop.ts     Tauri 桌面适配层
  shared/types.ts      前后端共享类型
src-tauri/
  src/config.rs        配置解析与校验
  src/lib.rs           Tauri 命令注册与窗口生命周期
  src/process_manager.rs
  src/storage.rs
  src/types.rs
docs/
  CHANGELOG.md
  DESIGN_NOTES.md
  TAURI_MIGRATION.md
```

## 文档

- 迁移说明：`docs/TAURI_MIGRATION.md`
- 更新记录：`docs/CHANGELOG.md`
- 设计说明：`docs/DESIGN_NOTES.md`
- 脚本说明：`scripts/README.md`
