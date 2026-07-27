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

// MinimizedFlag 是自启拉起时追加的命令行参数，用于让主进程静默启动到托盘，
// 避免登录后弹出可见窗口拖慢桌面呈现。main.go 与 SetLaunchOnStartup 必须使用同一常量。
const MinimizedFlag = "--minimized"

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

// SetLaunchOnStartup 设置/取消 Windows 开机自启。
// 幂等：当前注册表状态与目标一致时不再写入，避免每次启动都 fork reg.exe 拖慢开机。
func SetLaunchOnStartup(enabled bool) error {
	if runtime.GOOS != "windows" {
		return nil
	}
	if enabled {
		exe, err := os.Executable()
		if err != nil {
			return fmt.Errorf("无法获取应用路径: %w", err)
		}
		// 追加 --minimized：自启时以隐藏窗口方式进入托盘，只暴露托盘图标，
		// 减少登录后窗口渲染/WebView 初始化对进桌面的阻塞。
		desired := fmt.Sprintf(`"%s" %s`, exe, MinimizedFlag)
		if current, ok := readRunValue(); ok && current == desired {
			return nil
		}
		cmd := exec.Command("reg", "add", windowsRunKeyPath, "/v", windowsRunValueName, "/t", "REG_SZ", "/d", desired, "/f")
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

// readRunValue 读取当前 Run 值内容（含命令行参数）。
// 返回 ok=false 表示不存在或读取失败，此时视为需要写入。
func readRunValue() (string, bool) {
	cmd := exec.Command("reg", "query", windowsRunKeyPath, "/v", windowsRunValueName)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return "", false
	}
	// reg query 输出形如：
	//     AutoDevLauncher    REG_SZ    "C:\...\auto-dev-launcher.exe" --minimized
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, windowsRunValueName) {
			continue
		}
		// 用 REG_SZ 之后的部分作为 value（前面是值名和类型）。
		idx := strings.Index(line, "REG_SZ")
		if idx < 0 {
			return "", false
		}
		return strings.TrimSpace(line[idx+len("REG_SZ"):]), true
	}
	return "", false
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
