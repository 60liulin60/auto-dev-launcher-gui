package types

// DevConfig 开发服务器启动配置（JSON 字段使用 camelCase 与现网兼容）
type DevConfig struct {
	Command string            `json:"command"`
	Cwd     string            `json:"cwd"`
	Env     map[string]string `json:"env,omitempty"`
	Port    *uint16           `json:"port,omitempty"`
	Name    *string           `json:"name,omitempty"`
}

// ProjectHistoryEntry 项目历史记录条目
type ProjectHistoryEntry struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	LastLaunched uint64    `json:"lastLaunched"` // 毫秒时间戳
	Config       DevConfig `json:"config"`
}

// WindowBounds 窗口位置与尺寸
type WindowBounds struct {
	Width  uint32 `json:"width"`
	Height uint32 `json:"height"`
	X      *int32 `json:"x,omitempty"`
	Y      *int32 `json:"y,omitempty"`
}

// DefaultWindowBounds 默认窗口尺寸
func DefaultWindowBounds() WindowBounds {
	return WindowBounds{Width: 1200, Height: 800}
}

// AppSettings 应用设置（与 app-settings.json 兼容）
type AppSettings struct {
	WindowBounds       WindowBounds `json:"windowBounds"`
	Theme              string       `json:"theme"`
	MaxHistoryEntries  uint32       `json:"maxHistoryEntries"`
	LaunchOnStartup    bool         `json:"launchOnStartup"`
	CloseToTrayOnClose bool         `json:"closeToTrayOnClose"`
}

// DefaultAppSettings 默认应用设置
func DefaultAppSettings() AppSettings {
	return AppSettings{
		WindowBounds:      DefaultWindowBounds(),
		Theme:             "system",
		MaxHistoryEntries: 50,
	}
}

// ValidationError 配置校验错误
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationResult 配置校验结果
type ValidationResult struct {
	Valid  bool              `json:"valid"`
	Errors []ValidationError `json:"errors"`
}

// ServerStatus 服务器生命周期状态
type ServerStatus string

const (
	ServerStatusIdle     ServerStatus = "idle"
	ServerStatusStarting ServerStatus = "starting"
	ServerStatusRunning  ServerStatus = "running"
	ServerStatusStopped  ServerStatus = "stopped"
	ServerStatusError    ServerStatus = "error"
)

// ServerProcess 运行中的服务进程信息
type ServerProcess struct {
	ProjectID string       `json:"projectId"`
	PID       uint32       `json:"pid"`
	Status    ServerStatus `json:"status"`
	StartTime uint64       `json:"startTime"` // 毫秒时间戳
}

// OutputPayload 日志输出事件载荷
type OutputPayload struct {
	ProjectID string `json:"projectId"`
	Output    string `json:"output"`
}

// StatusChangePayload 状态变更事件载荷
type StatusChangePayload struct {
	ProjectID string       `json:"projectId"`
	Status    ServerStatus `json:"status"`
}

// UrlDetectedPayload URL 探测事件载荷
type UrlDetectedPayload struct {
	ProjectID string `json:"projectId"`
	URL       string `json:"url"`
}

// IPC 事件名（与 Tauri 侧保持一致）
const (
	EventServerOutput       = "server-output"
	EventServerStatusChange = "server-status-change"
	EventServerURLDetected  = "server-url-detected"
)
