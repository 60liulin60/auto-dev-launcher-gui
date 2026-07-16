//go:build !windows

package platform

import "os/exec"

// hideWindow 非 Windows 无操作
func hideWindow(cmd *exec.Cmd) {}
