//go:build windows

package process

import (
	"os/exec"
	"syscall"
)

// hideWindow 隐藏子进程控制台窗口，避免弹黑框
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
}
