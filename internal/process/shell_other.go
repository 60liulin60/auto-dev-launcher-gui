//go:build !windows

package process

import "os/exec"

// createShellCommand 非 Windows 平台用 sh -c 执行
func createShellCommand(raw string) *exec.Cmd {
	cmd := exec.Command("sh", "-c", raw)
	hideWindow(cmd)
	return cmd
}
