package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"
)

const (
	// appName 与现网 Tauri 版一致，保证用户数据路径兼容
	appName      = "auto-dev-launcher-gui"
	historyFile  = "project-history.json"
	settingsFile = "app-settings.json"
)

// Manager 本地 JSON 持久化（历史 + 设置），支持 .bak 回退与原子写
type Manager struct {
	storagePath string
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
	return atomicWriteJSON(m.historyFilePath(), history)
}

// LoadSettings 读取应用设置
func (m *Manager) LoadSettings() (types.AppSettings, error) {
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
	return atomicWriteJSON(m.settingsFilePath(), settings)
}

// SaveWindowBounds 更新并保存窗口边界
func (m *Manager) SaveWindowBounds(bounds types.WindowBounds) error {
	settings, err := m.LoadSettings()
	if err != nil {
		settings = types.DefaultAppSettings()
	}
	settings.WindowBounds = bounds
	return m.SaveSettings(settings)
}

func (m *Manager) historyFilePath() string {
	return filepath.Join(m.storagePath, historyFile)
}

func (m *Manager) settingsFilePath() string {
	return filepath.Join(m.storagePath, settingsFile)
}

// atomicWriteJSON 先写 .tmp，再备份旧文件为 .bak，最后 rename
func atomicWriteJSON(filePath string, value any) error {
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("无法序列化存储数据: %w", err)
	}

	tmpPath := filePath + ".tmp"
	bakPath := filePath + ".bak"

	if err := os.WriteFile(tmpPath, content, 0o644); err != nil {
		return fmt.Errorf("无法写入临时文件: %w", err)
	}

	if _, err := os.Stat(filePath); err == nil {
		_ = copyFile(filePath, bakPath)
		_ = os.Remove(filePath)
	}

	if err := os.Rename(tmpPath, filePath); err != nil {
		return fmt.Errorf("无法替换存储文件: %w", err)
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

	// 尝试把备份恢复为主文件
	_ = atomicWriteJSON(filePath, value)
	return &value, nil
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
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
