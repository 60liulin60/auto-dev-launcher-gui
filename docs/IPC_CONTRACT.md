# IPC 契约（Tauri → Wails）

语义与现网 Tauri 版一致；仅绑定风格从 `invoke` 变为 Wails 方法绑定，事件从 Tauri event 变为 `runtime.EventsEmit` / `runtime.EventsOn`。

## Commands

| 前端 API (`desktop.*`) | Go 方法 (`App.*`) | 说明 |
|---|---|---|
| `loadConfig(projectPath)` | `LoadConfig` | 加载 dev-config / package.json |
| `validateConfig(config)` | `ValidateConfig` | 校验配置 |
| `startServer(id, path, config, runtimeOverride)` | `StartServer` | 启动服务（node 项目可先装依赖） |
| `stopServer(id)` | `StopServer` | 停止服务 |
| `getServerStatus(id)` | `GetServerStatus` | 查询状态 |
| `getServerProcess(id)` | `GetServerProcess` | 状态 + 退出码 + 耗时 + 运行时 |
| `listRuntimes()` | `ListRuntimes` | 本机可选 Node 运行时（含"系统默认"） |
| `previewRuntime(path, override?)` | `PreviewRuntime` | 解析该项目将用的运行时 |
| `installRuntime(version)` | `InstallRuntime` | 调 nvm-windows 安装版本 |
| `selectScriptFile()` | `SelectScriptFile` | 选 .bat/.cmd 对话框 |
| `loadScriptConfig(scriptPath)` | `LoadScriptConfig` | 由脚本文件生成项目配置 |
| `loadHistory()` | `LoadHistory` | 历史列表 |
| `addToHistory(entry)` | `AddToHistory` | 新增/更新历史 |
| `removeFromHistory(id)` | `RemoveFromHistory` | 删除历史 |
| `clearHistory()` | `ClearHistory` | 清空历史 |
| `openInExplorer(pathOrUrl)` | `OpenInExplorer` | 打开路径或 URL |
| `checkPathExists(path)` | `CheckPathExists` | 路径是否存在 |
| `loadSettings()` | `LoadSettings` | 读取设置（含自启真实状态） |
| `saveSettings(settings)` | `SaveSettings` | 保存设置并应用自启 |
| `selectFolder()` | `SelectFolder` | 选文件夹对话框 |
| `confirm(message, title?)` | `Confirm` | 确认对话框 |

## Events

| 事件名 | 载荷 | 说明 |
|---|---|---|
| `server-output` | `{ projectId, output }` | 日志批量输出（~100ms） |
| `server-status-change` | `{ projectId, status, exitCode?, durationMs?, runtime?, runtimeSource?, runtimeNote? }` | 状态变更 |
| `server-url-detected` | `{ projectId, url }` | 检测到本地 URL |

## 状态枚举

`idle` | `starting` | `running` | `stopped` | `completed` | `error`

- `completed`：进程自行正常退出（退出码 0）。与用户点"停止"产生的 `stopped` 区分开。
- `error`：非 0 退出或启动失败，`exitCode` 会一并给出。

## 项目类型

`DevConfig.kind`：

- `node`（默认，旧配置缺省即此值）：按 `package.json` 跑命令，可注入指定 Node 运行时。
- `script`：`command` 是 `.bat`/`.cmd` 文件路径，`args` 是额外参数，`cwd` 缺省为脚本所在目录。

## Node 运行时

- 版本来源优先级：`dev-config.json` 的 `runtime` → 历史记录 `runtimeOverride` → 项目版本声明（`.nvmrc` → `.node-version` → `package.json engines.node`）→ 系统默认。
- 每种来源解析方式都是"取匹配前缀的最高已装版本"（`18` → 已装的 18.x 里最高的）。
- 无法解析的声明（`lts/*`、`>=18`）按未指定处理，`runtimeNote` 给出灰字提示；
  `^18.20.0` / `~18.20.0` 这类写法会降级为可匹配的前缀（`18` / `18.20`）。
- 声明了但本机未安装时报错（`ErrRuntimeNotFound`），界面据此提供"安装"入口，不会静默回退。
- 程序从不执行 `nvm use`：每次启动只把目标版本的安装目录前置到该子进程的 PATH
  （见 `docs/adr/0001-per-process-path-injection.md`），因此可以同时跑多个不同版本的项目。

## 存储兼容

- 目录：`%APPDATA%/auto-dev-launcher-gui/`
- 文件：`project-history.json`、`app-settings.json`（支持 `.bak` 回退）
- `project-history.json` 新增可选字段 `runtimeOverride`，旧文件可直接读取。
