//go:build !windows

package runtime

import "os/exec"

// hideWindow 非 Windows 平台无需隐藏控制台
func hideWindow(*exec.Cmd) {}
