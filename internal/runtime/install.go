package runtime

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Install 调用 nvm-windows 安装指定版本（如 "18" / "18.20.4"）。
// 安装期间会阻塞，调用方负责在界面显示进度。
func Install(nvmHome, version string) error {
	prefix, err := NormalizeSpec(version)
	if err != nil {
		return fmt.Errorf("无法安装的版本写法: %s", version)
	}
	if strings.TrimSpace(nvmHome) == "" {
		return fmt.Errorf("未配置 NVM_HOME，无法调用版本管理器安装")
	}

	nvmExe := filepath.Join(nvmHome, "nvm.exe")
	if _, statErr := os.Stat(nvmExe); statErr != nil {
		return fmt.Errorf("找不到 nvm.exe（NVM_HOME=%s）", nvmHome)
	}

	cmd := exec.Command(nvmExe, "install", prefix)
	hideWindow(cmd)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("nvm install %s 失败: %v\n%s", prefix, err, strings.TrimSpace(string(output)))
	}
	return nil
}
