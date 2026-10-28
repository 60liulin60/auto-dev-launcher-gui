package types

// ProjectKind 项目类型：node 项目用包管理器跑命令，script 项目直接执行 .bat/.cmd。
type ProjectKind string

const (
	// KindNode 依赖 Node 运行时的项目（package.json）
	KindNode ProjectKind = "node"
	// KindScript 独立的 Windows 批处理脚本（.bat/.cmd）
	KindScript ProjectKind = "script"
)

// Normalize 空值视为 node，保持与旧历史记录兼容
func (k ProjectKind) Normalize() ProjectKind {
	if k == "" {
		return KindNode
	}
	return k
}

// DevConfig 开发服务器启动配置（JSON 字段使用 camelCase 与现网兼容）
type DevConfig struct {
	Kind    ProjectKind       `json:"kind,omitempty"`
	Command string            `json:"command"`
	Cwd     string            `json:"cwd"`
	Env     map[string]string `json:"env,omitempty"`
	Port    *uint16           `json:"port,omitempty"`
	Name    *string           `json:"name,omitempty"`
	// Runtime 显式指定的 Node 版本声明（"18" / "18.20.4"），优先级最高
	Runtime string `json:"runtime,omitempty"`
	// Args 脚本项目的额外命令行参数（原样追加在执行命令之后）
	Args string `json:"args,omitempty"`
}

// ProjectHistoryEntry 项目历史记录条目
type ProjectHistoryEntry struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	LastLaunched uint64    `json:"lastLaunched"` // 毫秒时间戳
	Config       DevConfig `json:"config"`
	// RuntimeOverride 本机为该项目选定的运行时覆盖值，优先级高于项目内的版本声明
	RuntimeOverride string `json:"runtimeOverride,omitempty"`
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
	// ServerStatusCompleted 进程自行正常退出（退出码 0），与用户主动停止区分
	ServerStatusCompleted ServerStatus = "completed"
)

// ServerProcess 运行中的服务进程信息
type ServerProcess struct {
	ProjectID string       `json:"projectId"`
	PID       uint32       `json:"pid"`
	Status    ServerStatus `json:"status"`
	StartTime uint64       `json:"startTime"` // 毫秒时间戳
	// ExitCode 进程退出码，仅在 completed/error 且进程已收尾时有值
	ExitCode *int `json:"exitCode,omitempty"`
	// DurationMS 从启动到退出的耗时（毫秒）
	DurationMS uint64 `json:"durationMs,omitempty"`
	// Runtime 实际使用的 Node 版本（如 18.20.4）；脚本项目为空
	Runtime string `json:"runtime,omitempty"`
	// RuntimeSource 版本来自哪里（.nvmrc / dev-config.json / 本机记录 / 系统默认）
	RuntimeSource string `json:"runtimeSource,omitempty"`
	// RuntimeNote 需要提示但不阻塞启动的说明（如版本声明无法解析）
	RuntimeNote string `json:"runtimeNote,omitempty"`
}

// RuntimeOption 可选运行时（供前端列出已安装版本）
type RuntimeOption struct {
	Version string `json:"version"`
	Dir     string `json:"dir"`
	Source  string `json:"source"`
	// Label 界面展示名（系统默认为"系统默认"）
	Label string `json:"label"`
}

// OutputPayload 日志输出事件载荷
type OutputPayload struct {
	ProjectID string `json:"projectId"`
	Output    string `json:"output"`
}

// StatusChangePayload 状态变更事件载荷
type StatusChangePayload struct {
	ProjectID  string       `json:"projectId"`
	Status     ServerStatus `json:"status"`
	ExitCode   *int         `json:"exitCode,omitempty"`
	DurationMS uint64       `json:"durationMs,omitempty"`
	Runtime    string       `json:"runtime,omitempty"`
	// RuntimeSource 版本来源说明
	RuntimeSource string `json:"runtimeSource,omitempty"`
	// RuntimeNote 版本相关的提示文案
	RuntimeNote string `json:"runtimeNote,omitempty"`
}

// UrlDetectedPayload URL 探测事件载荷
type UrlDetectedPayload struct {
	ProjectID string `json:"projectId"`
	URL       string `json:"url"`
}

// RuntimePreview 启动前的运行时解析结果（供界面显示"将使用哪个版本"）
type RuntimePreview struct {
	// Version 解析出的具体版本；系统默认为空
	Version string `json:"version"`
	// Label 展示名
	Label string `json:"label"`
	// Source 来源说明
	Source string `json:"source"`
	// Note 不阻塞启动的提示
	Note string `json:"note,omitempty"`
	// Missing 声明的版本本机未安装
	Missing bool `json:"missing"`
	// Requested 用户/项目声明但未安装的版本
	Requested string `json:"requested,omitempty"`
	// Available 已安装版本列表（Missing 时供界面提示）
	Available []string `json:"available,omitempty"`
}

// IPC 事件名（与 Tauri 侧保持一致）
const (
	EventServerOutput       = "server-output"
	EventServerStatusChange = "server-status-change"
	EventServerURLDetected  = "server-url-detected"
)
