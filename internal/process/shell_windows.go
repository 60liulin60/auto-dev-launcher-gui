//go:build windows

package process

import (
	"os"
	"os/exec"
	"strings"
	"syscall"
)

// createShellCommand 构造 cmd.exe 调用。
//
// 这里直接接管命令行文本（SysProcAttr.CmdLine），而不是让 os/exec 拼参数：
// 命令里带引号时（脚本路径含空格），os/exec 的转义规则与 cmd.exe 的
// 引号剥离规则会打架，导致 "C:\my dir\run.bat" 被拆成两个词。
// cmd.exe 的规则是：/C 后若以引号开头，就去掉首尾各一个引号，
// 因此以引号开头的命令需要再包一层引号。
func createShellCommand(raw string) *exec.Cmd {
	comspec := os.Getenv("COMSPEC")
	if strings.TrimSpace(comspec) == "" {
		comspec = "cmd.exe"
	}

	cmdLine := "/C " + raw
	if strings.HasPrefix(raw, `"`) {
		cmdLine = `/C "` + raw + `"`
	}

	cmd := exec.Command(comspec)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CmdLine:       cmdLine,
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	return cmd
}
