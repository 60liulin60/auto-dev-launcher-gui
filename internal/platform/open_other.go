//go:build !windows

package platform

import (
	"os/exec"
	goruntime "runtime"
)

// openURL 在非 Windows 平台调用系统默认打开器；参数直接传给进程，不经 shell。
func openURL(url string) error {
	opener := "xdg-open"
	if goruntime.GOOS == "darwin" {
		opener = "open"
	}
	return exec.Command(opener, url).Start()
}