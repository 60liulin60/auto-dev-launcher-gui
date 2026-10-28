# Auto Dev Launcher — Go / Wails 重构版

独立于根目录 Tauri 树的迁移工作区（Reasonix Desktop 模式：Wails v2 + React + 纯 Go 内核）。

## 实现进度

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase 0 脚手架 + IPC 契约 | 完成 | `docs/IPC_CONTRACT.md`、目录结构、前端拷贝 |
| Phase 1 领域内核 | 完成 | types/config/storage/process/platform + 单测 |
| Phase 2 Wails 绑定 + bridge | 完成 | `desktop/main.go`、`desktop/app.go`（14 个 IPC 方法 + 事件桥接）、`frontend/.../desktop.ts` 已切 Wails runtime |
| Phase 3 托盘/自启 | 完成 | 开机自启（注册表）+ systray 托盘（显示主窗口/退出菜单）+ close-to-tray（`OnBeforeClose` 隐藏窗口）；图标嵌入 `build/icon.ico` |
| Phase 4 打包回归 | 完成 | `go build ./...` / `go test ./...` / `go vet` 全绿，前端 vitest 5/5 通过，`wails build` 端到端产出可执行 EXE（11MB）+ NSIS 安装包（`auto-dev-launcher-amd64-installer.exe`，6.5MB）均已实测生成 |
| Phase 5 多版本 Node + 批处理脚本 | 完成 | 每个子进程单独注入 PATH（不执行 `nvm use`），可同时跑不同 Node 版本的项目；新增 `kind: script` 支持 `.bat`/`.cmd`；新增 `completed` 状态与退出码/耗时展示。详见 `GLOSSARY.md`、`docs/adr/0001-per-process-path-injection.md`、`docs/IPC_CONTRACT.md` |

## 多版本 Node 与脚本项目

- **运行时选择**：`dev-config.json` 的 `runtime` → 本机记录的 `runtimeOverride` → 项目版本声明（`.nvmrc` → `.node-version` → `package.json` 的 `engines.node`）→ 系统默认；每种来源都取"匹配前缀的最高已装版本"。
- **不污染全局**：程序从不执行 `nvm use`，只在启动子进程时把目标版本目录前置到该进程的 `PATH`，因此多个项目可以并行跑在各自的 Node 版本上（`docs/adr/0001-per-process-path-injection.md`）。
- **版本缺失**：声明了本机没装的版本会直接报错并给出安装入口，不会静默回退到系统 Node。
- **脚本项目**：新增项目时可选 `.bat` / `.cmd`，支持启动参数与自定义工作目录（默认脚本所在目录），不注入 Node 运行时。

## 结构

```
refactor/
  go.mod
  internal/{types,config,storage,process,platform,runtime}
  desktop/                 # package main + Wails 绑定
  desktop/frontend/        # React（bridge 已切 Wails）
  docs/IPC_CONTRACT.md
  scripts/build.ps1
```

## 前置条件（Windows）

1. Go 1.22+
2. Node.js 20+ / pnpm
3. WebView2
4. （可选）Wails CLI：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`

当前 CI/沙箱环境可能未预装 Go；请在本机安装后执行下方命令。

## 构建

```powershell
cd refactor
go mod tidy
go test ./...

cd desktop/frontend
pnpm install
pnpm run build
cd ../..

# 安装 Wails CLI 与 NSIS 后，构建 Windows 安装程序（默认模式）
go install github.com/wailsapp/wails/v2/cmd/wails@latest
# 安装 NSIS 后重开终端，确保 makensis 在 PATH 中
.\scripts\build.ps1
```

### Windows 安装程序（默认）

`build.ps1` 默认生成 NSIS 安装程序，带应用图标、安装、开始菜单和卸载能力。安装 Wails CLI 与 NSIS 后，执行：

```powershell
go install github.com/wailsapp/wails/v2/cmd/wails@latest
# 安装 NSIS 后重开终端，确保 makensis 在 PATH 中
.\scripts\build.ps1 -Package Installer
```

安装程序输出到 `desktop/build/bin/`。Wails 会使用 NSIS 创建带安装、开始菜单和卸载能力的 Windows 安装包。

### 绿色版（可选）

```powershell
.\scripts\build.ps1 -Package Portable
```

绿色版输出：`bin/auto-dev-launcher.exe`。它可直接运行，但不会创建开始菜单或卸载项；该版本使用 `windowsgui` 子系统，不会显示 CMD 窗口。

使用 Wails 开发热重载：

```powershell
cd refactor/desktop
wails dev
```

## 兼容性

- 用户数据：`%APPDATA%/auto-dev-launcher-gui/`
- 文件：`project-history.json`、`app-settings.json`（含 `.bak`）
- 根目录 Tauri 工程未改默认入口脚本

## 说明

- 新 Go 代码含中文注释（UTF-8）
- 构建完成后不会自动启动应用
- v1 仅 Windows
