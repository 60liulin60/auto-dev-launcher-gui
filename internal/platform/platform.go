package platform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/config"
)

const (
	// windowsRunKeyPath 开机自启注册表路径
	windowsRunKeyPath = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	// windowsRunValueName 注册表值名（与现网一致）
	windowsRunValueName = "AutoDevLauncher"
	// createNoWindow Windows 创建无控制台窗口标志
	createNoWindow = 0x08000000
)

// OpenInExplorer 打开本地路径或 http(s) URL
func OpenInExplorer(pathOrURL string) error {
	if strings.HasPrefix(pathOrURL, "http://") || strings.HasPrefix(pathOrURL, "https://") {
		return openURL(pathOrURL)
	}
	path, err := config.SanitizePath(pathOrURL)
	if err != nil {
		return err
	}
	return openPath(path)
}

// CheckPathExists 在路径净化后检查是否存在
func CheckPathExists(filePath string) (bool, error) {
	path, err := config.SanitizePath(filePath)
	if err != nil {
		return false, nil
	}
	_, err = os.Stat(path)
	return err == nil, nil
}

// SetLaunchOnStartup 设置/取消 Windows 开机自启
func SetLaunchOnStartup(enabled bool) error {
	if runtime.GOOS != "windows" {
		return nil
	}
	if enabled {
		exe, err := os.Executable()
		if err != nil {
			return fmt.Errorf("无法获取应用路径: %w", err)
		}
		value := fmt.Sprintf(`"%s"`, exe)
		cmd := exec.Command("reg", "add", windowsRunKeyPath, "/v", windowsRunValueName, "/t", "REG_SZ", "/d", value, "/f")
		hideWindow(cmd)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("设置开机自启失败: %w (%s)", err, string(out))
		}
		return nil
	}

	on, err := IsLaunchOnStartupEnabled()
	if err != nil {
		return err
	}
	if !on {
		return nil
	}
	cmd := exec.Command("reg", "delete", windowsRunKeyPath, "/v", windowsRunValueName, "/f")
	hideWindow(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("取消开机自启失败: %w (%s)", err, string(out))
	}
	return nil
}

// IsLaunchOnStartupEnabled 查询开机自启是否已启用
func IsLaunchOnStartupEnabled() (bool, error) {
	if runtime.GOOS != "windows" {
		return false, nil
	}
	cmd := exec.Command("reg", "query", windowsRunKeyPath, "/v", windowsRunValueName)
	hideWindow(cmd)
	err := cmd.Run()
	return err == nil, nil
}

func openURL(url string) error {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("cmd", "/C", "start", "", url)
		hideWindow(cmd)
		return cmd.Start()
	}
	opener := "xdg-open"
	if runtime.GOOS == "darwin" {
		opener = "open"
	}
	return exec.Command(opener, url).Start()
}

func openPath(path string) error {
	if runtime.GOOS == "windows" {
		// explorer 接受绝对路径
		return exec.Command("explorer", path).Start()
	}
	opener := "xdg-open"
	if runtime.GOOS == "darwin" {
		opener = "open"
	}
	return exec.Command(opener, path).Start()
}

// hideWindow 在 Windows 上隐藏子进程控制台窗口

// ResolveExeDir 返回当前可执行文件所在目录（托盘/图标路径用）
func ResolveExeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}
