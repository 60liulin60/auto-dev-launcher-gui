//go:build !windows

package process

import "os/exec"

// hideWindow 非 Windows 无操作
func hideWindow(cmd *exec.Cmd) {}
