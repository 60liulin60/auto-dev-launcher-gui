# IPC 契约（Tauri → Wails）

语义与现网 Tauri 版一致；仅绑定风格从 `invoke` 变为 Wails 方法绑定，事件从 Tauri event 变为 `runtime.EventsEmit` / `runtime.EventsOn`。

## Commands

| 前端 API (`desktop.*`) | Go 方法 (`App.*`) | 说明 |
|---|---|---|
| `loadConfig(projectPath)` | `LoadConfig` | 加载 dev-config / package.json |
| `validateConfig(config)` | `ValidateConfig` | 校验配置 |
| `startServer(id, path, config)` | `StartServer` | 启动服务（可先装依赖） |
| `stopServer(id)` | `StopServer` | 停止服务 |
| `getServerStatus(id)` | `GetServerStatus` | 查询状态 |
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
| `server-status-change` | `{ projectId, status }` | 状态变更 |
| `server-url-detected` | `{ projectId, url }` | 检测到本地 URL |

## 状态枚举

`idle` | `starting` | `running` | `stopped` | `error`

## 存储兼容

- 目录：`%APPDATA%/auto-dev-launcher-gui/`
- 文件：`project-history.json`、`app-settings.json`（支持 `.bak` 回退）
