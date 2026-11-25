package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"
)

const (
	// appName 与现网 Tauri 版一致，保证用户数据路径兼容
	appName      = "auto-dev-launcher-gui"
	historyFile  = "project-history.json"
	settingsFile = "app-settings.json"
)

// Manager 本地 JSON 持久化（历史 + 设置），支持 .bak 回退与原子写。
//
// Wails 每个绑定方法都在独立 goroutine 中执行，多个保存可能并发到达；
// 所有读写都用 mu 串行化，避免共用临时文件或读改写丢更新。
type Manager struct {
	storagePath string
	mu          sync.Mutex
}

// New 创建存储管理器；目录不存在时自动创建
func New() (*Manager, error) {
	path := getStoragePath()
	if err := os.MkdirAll(path, 0o755); err != nil {
		return nil, fmt.Errorf("无法创建存储目录: %w", err)
	}
	return &Manager{storagePath: path}, nil
}

// NewWithPath 测试用：指定存储根目录
func NewWithPath(path string) (*Manager, error) {
	if err := os.MkdirAll(path, 0o755); err != nil {
		return nil, err
	}
	return &Manager{storagePath: path}, nil
}

// StoragePath 返回存储根路径
func (m *Manager) StoragePath() string {
	return m.storagePath
}

// LoadProjectHistory 读取项目历史；损坏时尝试 .bak
func (m *Manager) LoadProjectHistory() ([]types.ProjectHistoryEntry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.loadProjectHistoryLocked()
}

func (m *Manager) loadProjectHistoryLocked() ([]types.ProjectHistoryEntry, error) {
	value, err := readJSONWithFallback[[]types.ProjectHistoryEntry](m.historyFilePath())
	if err != nil {
		return nil, err
	}
	if value == nil {
		return []types.ProjectHistoryEntry{}, nil
	}
	return *value, nil
}

// SaveProjectHistory 原子写入项目历史
func (m *Manager) SaveProjectHistory(history []types.ProjectHistoryEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.saveProjectHistoryLocked(history)
}

func (m *Manager) saveProjectHistoryLocked(history []types.ProjectHistoryEntry) error {
	return atomicWriteJSON(m.historyFilePath(), history)
}

// UpdateProjectHistory 在同一把锁内完成“读取-修改-写回”，
// 避免并发 Add/Remove 各自基于旧快照保存而丢更新。
func (m *Manager) UpdateProjectHistory(update func([]types.ProjectHistoryEntry) ([]types.ProjectHistoryEntry, error)) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	history, err := m.loadProjectHistoryLocked()
	if err != nil {
		return err
	}
	next, err := update(history)
	if err != nil {
		return err
	}
	return m.saveProjectHistoryLocked(next)
}

// LoadSettings 读取应用设置
func (m *Manager) LoadSettings() (types.AppSettings, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.loadSettingsLocked()
}

func (m *Manager) loadSettingsLocked() (types.AppSettings, error) {
	value, err := readJSONWithFallback[types.AppSettings](m.settingsFilePath())
	if err != nil {
		return types.AppSettings{}, err
	}
	if value == nil {
		return types.DefaultAppSettings(), nil
	}
	return *value, nil
}

// SaveSettings 原子写入应用设置
func (m *Manager) SaveSettings(settings types.AppSettings) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.saveSettingsLocked(settings)
}

func (m *Manager) saveSettingsLocked(settings types.AppSettings) error {
	return atomicWriteJSON(m.settingsFilePath(), settings)
}

// SaveWindowBounds 更新并保存窗口边界；读取与写回在同一把锁内完成。
func (m *Manager) SaveWindowBounds(bounds types.WindowBounds) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	settings, err := m.loadSettingsLocked()
	if err != nil {
		settings = types.DefaultAppSettings()
	}
	settings.WindowBounds = bounds
	return m.saveSettingsLocked(settings)
}

func (m *Manager) historyFilePath() string {
	return filepath.Join(m.storagePath, historyFile)
}

func (m *Manager) settingsFilePath() string {
	return filepath.Join(m.storagePath, settingsFile)
}

// atomicWriteJSON 先写唯一临时文件，再把旧文件备份为 .bak，最后 rename 覆盖主文件。
//
// 注意：只有当前主文件仍是有效 JSON 时才更新 .bak。恢复流程会调用本函数把
// .bak 的内容写回主文件，此时主文件已损坏；若仍复制主文件到 .bak，就会用
// 损坏内容覆盖唯一有效备份。
func atomicWriteJSON(filePath string, value any) error {
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("无法序列化存储数据: %w", err)
	}

	if data, readErr := os.ReadFile(filePath); readErr == nil && json.Valid(data) {
		if err := writeFileAtomic(filePath+".bak", data); err != nil {
			return fmt.Errorf("无法备份存储文件: %w", err)
		}
	}

	if err := writeFileAtomic(filePath, content); err != nil {
		return fmt.Errorf("无法替换存储文件: %w", err)
	}
	return nil
}

// writeFileAtomic 使用同目录下的唯一临时文件 + rename，避免并发写入共用 .tmp。
func writeFileAtomic(filePath string, content []byte) error {
	dir := filepath.Dir(filePath)
	tmp, err := os.CreateTemp(dir, filepath.Base(filePath)+".tmp-*")
	if err != nil {
		return fmt.Errorf("无法创建临时文件: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("无法写入临时文件: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("无法写入临时文件: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("无法写入临时文件: %w", err)
	}
	if err := os.Rename(tmpPath, filePath); err != nil {
		return err
	}
	return nil
}

func readJSONWithFallback[T any](filePath string) (*T, error) {
	if data, err := os.ReadFile(filePath); err == nil {
		var value T
		if err := json.Unmarshal(data, &value); err == nil {
			return &value, nil
		}
	}

	bakPath := filePath + ".bak"
	data, err := os.ReadFile(bakPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("无法读取备份文件: %w", err)
	}

	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, fmt.Errorf("备份文件格式无效: %w", err)
	}

	// 尝试把备份恢复为主文件。atomicWriteJSON 会识别出主文件已损坏，
	// 因此只会重写主文件，不会覆盖仍然有效的 .bak。
	_ = atomicWriteJSON(filePath, value)
	return &value, nil
}

// getStoragePath 返回与现网一致的用户数据目录
func getStoragePath() string {
	if base := os.Getenv("APPDATA"); base != "" {
		return filepath.Join(base, appName)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".", appName)
	}
	return filepath.Join(home, "AppData", "Roaming", appName)
}