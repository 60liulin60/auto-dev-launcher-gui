# 开发服务器启动工具

> 基于 `Tauri 2 + React 19 + Rust` 的桌面应用，用于统一管理本地项目并启动开发服务器。

![界面预览](docs/image.png)

## 项目状态

- 桌面端已经完全迁移到 `Tauri`
- 旧的 `Electron` 主进程、`preload`、IPC 桥接和相关打包配置已经移除
- 前端统一通过 `src/renderer/lib/desktop.ts` 调用桌面能力
- Windows 发布版已处理额外控制台弹窗问题，并补充了启动失败兜底界面

## 主要功能

- 自动读取 `package.json` / `dev-config.json`
- 自动识别包管理器，并在缺少 `node_modules` 时补装依赖
- 管理多个项目的启动状态与历史记录
- 实时展示日志，支持错误筛选、关键词搜索和本地地址点击打开
- 删除项目时先确认，再停止运行中的项目，最后移除记录
- 关闭应用前自动停止所有已启动项目

## 技术栈

- `Tauri 2`
- `React 19`
- `Vite 7`
- `Rust`
- `TypeScript`

## 开发环境

- `Node.js 20+`
- `pnpm`
- `Rust` 与 `cargo`

如果 Windows 下执行 `pnpm tauri dev` 或 `pnpm tauri build` 时提示找不到 `cargo`，先把下面目录加入 `PATH`：

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

## 快速开始

```bash
pnpm install
pnpm run dev
```

开发模式下，前端默认使用：

- `http://127.0.0.1:4173`

## 常用命令

```bash
pnpm install
pnpm run dev
pnpm run build:web
pnpm test
pnpm run clean
pnpm run package:win:nosign
```

说明：

- `pnpm run dev`：启动 Tauri 开发模式
- `pnpm run build:web`：单独构建前端资源
- `pnpm test`：运行前端测试
- `pnpm run clean`：清理构建产物
- `pnpm run package:win:nosign`：生成 Windows 安装包

## 打包输出

Windows 安装包默认输出到：

```text
src-tauri/target/release/bundle/nsis/
```

生成的主安装包文件名类似：

```text
开发服务器启动工具_1.0.5_x64-setup.exe
```

如果只想验证 Rust 侧是否可以正常编译，可使用：

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
pnpm tauri build --debug --no-bundle
```

## 项目结构

```text
src/
  renderer/
    components/          React 组件
    contexts/            状态管理上下文
    lib/desktop.ts       Tauri 桌面能力适配层
    main.tsx             渲染入口与启动兜底
  shared/types.ts        前后端共享类型
src-tauri/
  src/config.rs          项目配置解析与校验
  src/lib.rs             Tauri 命令注册与窗口生命周期
  src/main.rs            桌面应用入口
  src/process_manager.rs 进程启动、停止与日志采集
  src/storage.rs         本地历史记录与设置持久化
  src/types.rs           Rust 侧共享类型
docs/
  CHANGELOG.md
  DESIGN_NOTES.md
  TAURI_MIGRATION.md
scripts/
  README.md
```

## 排障

### 1. `cargo` 找不到

确认已安装 Rust，并把 `%USERPROFILE%\.cargo\bin` 加入系统环境变量或当前终端 `PATH`。

### 2. 开发端口冲突

当前开发端口固定为 `4173`。如果本地已有程序占用该端口，请先释放端口后再执行 `pnpm run dev`。

### 3. 删除项目没有立即生效

应用会先尝试停止已启动项目，再执行删除；如果项目停止失败，会保留记录并提示错误。

## 相关文档

- `docs/TAURI_MIGRATION.md`：迁移说明
- `docs/CHANGELOG.md`：更新记录
- `docs/DESIGN_NOTES.md`：设计说明
- `scripts/README.md`：脚本说明