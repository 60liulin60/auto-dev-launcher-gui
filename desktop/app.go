package main

import (
	"context"
	"fmt"
	"sync/atomic"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/config"
	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/platform"
	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/process"
	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/storage"
	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是 Wails 绑定的应用结构体，作为前端 IPC 的入口。
// 它把领域内核（config/storage/process/platform）薄封装为导出方法，
// 语义与现网 Tauri 命令层保持一致（见 docs/IPC_CONTRACT.md）。
type App struct {
	ctx     context.Context
	storage *storage.Manager
	process *process.Manager
	// exitRequested 标记用户已确认退出，避免 close-to-tray 拦截真正的退出。
	exitRequested atomic.Bool
}

// runtimeEmitter 把进程管理器的事件桥接到 Wails runtime.EventsEmit。
type runtimeEmitter struct {
	ctx context.Context
}

// Emit 实现 process.Emitter 接口。
func (e *runtimeEmitter) Emit(event string, data any) {
	if e.ctx == nil {
		return
	}
	runtime.EventsEmit(e.ctx, event, data)
}

// NewApp 创建 App；存储初始化失败为致命错误（无法持久化历史/设置）。
func NewApp() (*App, error) {
	store, err := storage.New()
	if err != nil {
		return nil, fmt.Errorf("初始化存储失败: %w", err)
	}
	return &App{
		storage: store,
		process: process.New(nil),
	}, nil
}

// startup 由 Wails 在 DOM 就绪前调用，注入 context 并接通事件发射器。
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.process.SetEmitter(&runtimeEmitter{ctx: ctx})

	// 与现网一致：启动时把设置里的自启开关应用到系统，
	// 并将真实注册表状态回写（忽略非 Windows 或失败情况）。
	settings, err := a.storage.LoadSettings()
	if err == nil {
		_ = platform.SetLaunchOnStartup(settings.LaunchOnStartup)
	}

	// 启动系统托盘（独立 goroutine，事件循环阻塞）。
	startTray(a)
}

// shutdown 由 Wails 在退出前调用，确保子进程被清理并移除托盘图标。
func (a *App) shutdown(ctx context.Context) {
	_ = a.process.StopAllServers()
	systray.Quit()
}

// beforeClose 由 Wails 在窗口关闭前调用。返回 true 可阻止关闭。
// 复刻现网 close-to-tray 语义：若已确认退出则放行；否则按设置隐藏到托盘。
func (a *App) beforeClose(ctx context.Context) bool {
	if a.exitRequested.Load() {
		return false
	}

	settings, err := a.storage.LoadSettings()
	if err == nil && settings.CloseToTrayOnClose {
		runtime.WindowHide(ctx)
		return true // 阻止关闭，仅隐藏
	}

	// 未开启 close-to-tray：走正常退出流程
	a.requestExit()
	return false
}

// showMainWindow 恢复并聚焦主窗口（托盘“显示主窗口”/左键单击用）。
func (a *App) showMainWindow() {
	if a.ctx == nil {
		return
	}
	if runtime.WindowIsMinimised(a.ctx) {
		runtime.WindowUnminimise(a.ctx)
	}
	runtime.WindowShow(a.ctx)
}

// MinimiseWindow 最小化窗口（前端自绘标题栏调用）。
func (a *App) MinimiseWindow() {
	if a.ctx != nil {
		runtime.WindowMinimise(a.ctx)
	}
}

// ToggleMaximiseWindow 在最大化/还原之间切换（前端自绘标题栏调用）。
func (a *App) ToggleMaximiseWindow() {
	if a.ctx != nil {
		runtime.WindowToggleMaximise(a.ctx)
	}
}

// CloseWindow 请求关闭窗口，走与原生关闭一致的 close-to-tray 逻辑
// （前端自绘标题栏的关闭按钮调用）。
func (a *App) CloseWindow() {
	if a.ctx == nil {
		return
	}
	if a.beforeClose(a.ctx) {
		return // 已隐藏到托盘
	}
	// beforeClose 未拦截时会触发 requestExit，此处无需重复。
}

// requestExit 标记退出并在停止全部子进程后关闭应用；保证只触发一次。
func (a *App) requestExit() {
	if a.exitRequested.Swap(true) {
		return
	}
	go func() {
		_ = a.process.StopAllServers()
		if a.ctx != nil {
			runtime.Quit(a.ctx)
		}
	}()
}

// LoadConfig 加载项目 dev-config.json 或依据 package.json 自动生成。
func (a *App) LoadConfig(projectPath string) (types.DevConfig, error) {
	return config.LoadProjectConfig(projectPath)
}

// ValidateConfig 校验配置合法性并返回结构化结果。
func (a *App) ValidateConfig(cfg types.DevConfig) types.ValidationResult {
	return config.ValidateDevConfig(cfg)
}

// StartServer 启动项目开发服务器（必要时先装依赖）。
func (a *App) StartServer(projectID, projectPath string, cfg types.DevConfig) (types.ServerProcess, error) {
	return a.process.StartServer(projectID, projectPath, cfg)
}

// StopServer 停止指定项目进程。
func (a *App) StopServer(projectID string) error {
	return a.process.StopServer(projectID)
}

// GetServerStatus 查询项目状态。
func (a *App) GetServerStatus(projectID string) types.ServerStatus {
	return a.process.GetServerStatus(projectID)
}

// LoadHistory 返回项目历史列表。
func (a *App) LoadHistory() ([]types.ProjectHistoryEntry, error) {
	return a.storage.LoadProjectHistory()
}

// AddToHistory 新增或更新历史记录：按 id 去重并刷新最后启动时间。
// 复刻现网 Tauri add_to_history 命令的语义。
func (a *App) AddToHistory(entry types.ProjectHistoryEntry) error {
	history, err := a.storage.LoadProjectHistory()
	if err != nil {
		return err
	}

	entry.LastLaunched = currentTimestampMS()

	replaced := false
	for i := range history {
		if history[i].ID == entry.ID {
			history[i] = entry
			replaced = true
			break
		}
	}
	if !replaced {
		history = append(history, entry)
	}

	return a.storage.SaveProjectHistory(history)
}

// RemoveFromHistory 按 id 删除历史记录。
func (a *App) RemoveFromHistory(projectID string) error {
	history, err := a.storage.LoadProjectHistory()
	if err != nil {
		return err
	}

	filtered := make([]types.ProjectHistoryEntry, 0, len(history))
	for _, entry := range history {
		if entry.ID != projectID {
			filtered = append(filtered, entry)
		}
	}

	return a.storage.SaveProjectHistory(filtered)
}

// ClearHistory 清空历史记录。
func (a *App) ClearHistory() error {
	return a.storage.SaveProjectHistory([]types.ProjectHistoryEntry{})
}

// OpenInExplorer 在系统资源管理器或浏览器中打开路径/URL。
func (a *App) OpenInExplorer(pathOrURL string) error {
	return platform.OpenInExplorer(pathOrURL)
}

// CheckPathExists 校验路径存在性（净化后）。
func (a *App) CheckPathExists(filePath string) (bool, error) {
	return platform.CheckPathExists(filePath)
}

// LoadSettings 读取应用设置，并用真实注册表状态覆盖自启开关。
func (a *App) LoadSettings() (types.AppSettings, error) {
	settings, err := a.storage.LoadSettings()
	if err != nil {
		return types.AppSettings{}, err
	}
	if enabled, err := platform.IsLaunchOnStartupEnabled(); err == nil {
		settings.LaunchOnStartup = enabled
	}
	return settings, nil
}

// SaveSettings 保存设置并应用自启，回写真实注册表状态后返回。
func (a *App) SaveSettings(settings types.AppSettings) (types.AppSettings, error) {
	if err := platform.SetLaunchOnStartup(settings.LaunchOnStartup); err != nil {
		return types.AppSettings{}, err
	}
	if enabled, err := platform.IsLaunchOnStartupEnabled(); err == nil {
		settings.LaunchOnStartup = enabled
	}
	if err := a.storage.SaveSettings(settings); err != nil {
		return types.AppSettings{}, err
	}
	return settings, nil
}

// SelectFolder 打开选择文件夹对话框，取消返回空字符串。
func (a *App) SelectFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择项目文件夹",
	})
}

// Confirm 弹出确认对话框，返回用户是否点了"是"。
func (a *App) Confirm(message string, title string) (bool, error) {
	if title == "" {
		title = "确认操作"
	}
	result, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       []string{"是", "否"},
		DefaultButton: "是",
		CancelButton:  "否",
	})
	if err != nil {
		return false, err
	}
	return result == "是", nil
}
