//go:build windows

package platform

import (
	"syscall"
	"unsafe"
)

var (
	shell32       = syscall.NewLazyDLL("shell32.dll")
	shellExecuteW = shell32.NewProc("ShellExecuteW")
)

// openURL 通过 ShellExecuteW 打开 URL，避免经 cmd.exe 时 & | ^ % 等字符被二次解析。
func openURL(url string) error {
	verb, err := syscall.UTF16PtrFromString("open")
	if err != nil {
		return err
	}
	target, err := syscall.UTF16PtrFromString(url)
	if err != nil {
		return err
	}

	// SW_SHOWNORMAL = 1；ShellExecuteW 返回值 <= 32 表示失败。
	result, _, callErr := shellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(target)),
		0,
		0,
		1,
	)
	if result <= 32 {
		if callErr != nil && callErr != syscall.Errno(0) {
			return callErr
		}
		return syscall.EINVAL
	}
	return nil
}