package process

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/config"
	noderuntime "github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/runtime"
	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"
)

func TestExtractLocalURL(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"  ➜  Local:   http://localhost:5173/", "http://localhost:5173", true},
		{"Local: http://127.0.0.1:3000", "http://localhost:3000", true},
		{"server ready on 0.0.0.0:8080", "", false},
	}
	for _, c := range cases {
		got, ok := ExtractLocalURL(c.in)
		if ok != c.ok || got != c.want {
			t.Fatalf("in=%q got=%q ok=%v want=%q/%v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestGetServerStatusIdle(t *testing.T) {
	m := New(nil)
	if st := m.GetServerStatus("missing"); st != "idle" {
		t.Fatalf("got %s", st)
	}
}

func TestPrependPathPutsRuntimeFirst(t *testing.T) {
	env := []string{"HOME=x", "Path=C:\\a;C:\\b"}
	got := prependPath(env, `C:\nvm\v18.20.4`)
	want := "Path=" + `C:\nvm\v18.20.4` + string(os.PathListSeparator) + `C:\a;C:\b`
	if len(got) != 2 || got[1] != want {
		t.Fatalf("got %v, want %q", got, want)
	}

	// 环境里完全没有 PATH 时补一条
	got = prependPath([]string{"HOME=x"}, "d")
	if len(got) != 2 || got[1] != "PATH=d" {
		t.Fatalf("got %v", got)
	}
}

func TestApplyEnvironmentInjectsRuntimeAndBlocksPathOverride(t *testing.T) {
	m := New(nil)
	cmd := &exec.Cmd{}
	m.applyEnvironment(cmd, "p1", map[string]string{
		"PATH":   `C:\evil`,
		"CUSTOM": "1",
	}, `C:\nvm\v14.21.3`)

	var pathValue string
	for _, kv := range cmd.Env {
		key, value, _ := strings.Cut(kv, "=")
		if strings.EqualFold(key, "PATH") {
			pathValue = value
		}
	}
	if !strings.HasPrefix(pathValue, `C:\nvm\v14.21.3`) {
		t.Fatalf("运行时目录应在 PATH 最前面，实际 %q", pathValue)
	}
	if strings.Contains(pathValue, `C:\evil`) {
		t.Fatalf("项目 env 不应覆盖 PATH，实际 %q", pathValue)
	}

	found := false
	for _, kv := range cmd.Env {
		if kv == "CUSTOM=1" {
			found = true
		}
	}
	if !found {
		t.Fatal("项目自定义环境变量应被保留")
	}
}

func TestApplyEnvironmentLeavesInheritedEnvUntouched(t *testing.T) {
	m := New(nil)
	cmd := &exec.Cmd{}
	m.applyEnvironment(cmd, "p1", nil, "")
	if cmd.Env != nil {
		t.Fatalf("没有运行时与自定义 env 时应完全继承父进程环境，实际 %v", cmd.Env)
	}
}

func TestBuildCommandForScript(t *testing.T) {
	cfg := types.DevConfig{Kind: types.KindScript, Args: "--port 3000"}
	raw, err := buildCommand(types.KindScript, `C:\my scripts\a.bat`, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if raw != `"C:\my scripts\a.bat" --port 3000` {
		t.Fatalf("got %q", raw)
	}

	raw, err = buildCommand(types.KindScript, `C:\x\a.cmd`, types.DevConfig{})
	if err != nil || raw != `C:\x\a.cmd` {
		t.Fatalf("got %q err=%v", raw, err)
	}
}

func TestBuildCommandForNodeSanitizes(t *testing.T) {
	raw, err := buildCommand(types.KindNode, `C:\proj`, types.DevConfig{Command: "npm run dev $(rm -rf)"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(raw, "$(") {
		t.Fatalf("命令替换应被清理，实际 %q", raw)
	}
}

func writeScript(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	script := filepath.Join(dir, "run me.bat")
	if err := os.WriteFile(script, []byte("@echo off\r\n"+body), 0o644); err != nil {
		t.Fatalf("写入脚本失败: %v", err)
	}
	return script
}

func waitForStatus(t *testing.T, m *Manager, projectID string, want types.ServerStatus) types.ServerProcess {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		info := m.GetServerProcess(projectID)
		if info.Status == want {
			return info
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("等待状态 %s 超时，当前: %+v", want, m.GetServerProcess(projectID))
	return types.ServerProcess{}
}

func TestScriptProjectCompletesWithExitCode(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("脚本项目依赖 cmd /C，仅在 Windows 上验证")
	}

	script := writeScript(t, "echo hello from script\r\nexit /b 0\r\n")
	cfg, err := config.BuildScriptConfig(script)
	if err != nil {
		t.Fatalf("生成脚本配置失败: %v", err)
	}

	m := New(nil)
	if _, err := m.StartServer(StartOptions{ProjectID: "script-ok", ProjectPath: script, Config: cfg}); err != nil {
		t.Fatalf("启动脚本失败: %v", err)
	}

	info := waitForStatus(t, m, "script-ok", types.ServerStatusCompleted)
	if info.ExitCode == nil || *info.ExitCode != 0 {
		t.Fatalf("退出码应为 0，实际 %+v", info.ExitCode)
	}
	if info.PID == 0 {
		t.Fatal("应记录进程 PID")
	}
}

func TestScriptProjectNonZeroExitIsError(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("脚本项目依赖 cmd /C，仅在 Windows 上验证")
	}

	script := writeScript(t, "exit /b 3\r\n")
	cfg, err := config.BuildScriptConfig(script)
	if err != nil {
		t.Fatalf("生成脚本配置失败: %v", err)
	}

	m := New(nil)
	if _, err := m.StartServer(StartOptions{ProjectID: "script-fail", ProjectPath: script, Config: cfg}); err != nil {
		t.Fatalf("启动脚本失败: %v", err)
	}

	info := waitForStatus(t, m, "script-fail", types.ServerStatusError)
	if info.ExitCode == nil || *info.ExitCode != 3 {
		t.Fatalf("退出码应为 3，实际 %+v", info.ExitCode)
	}
}

// recordEmitter 收集输出用于断言
type recordEmitter struct {
	mu     sync.Mutex
	output map[string]string
}

func newRecordEmitter() *recordEmitter {
	return &recordEmitter{output: map[string]string{}}
}

func (e *recordEmitter) Emit(event string, data any) {
	if event != types.EventServerOutput {
		return
	}
	payload, ok := data.(types.OutputPayload)
	if !ok {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.output[payload.ProjectID] += payload.Output
}

func (e *recordEmitter) text(projectID string) string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.output[projectID]
}

func TestNodeProjectUsesInjectedRuntime(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("运行时注入依赖 cmd.exe 与 Windows 版 nvm")
	}
	available, err := noderuntime.Discover(os.Getenv("NVM_HOME"))
	if err != nil || len(available) < 2 {
		t.Skip("本机没有可对比的多个 nvm 版本，跳过")
	}

	// 取最低版本，它通常不等于 PATH 上的系统默认 node，能证明是注入生效
	target := available[len(available)-1]
	system := noderuntime.System()

	dir := t.TempDir()
	pkg := `{"name":"demo","scripts":{"dev":"node -v"}}`
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".nvmrc"), []byte(target.Version+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	emitter := newRecordEmitter()
	m := New(emitter)
	m.SetRuntimes(available, system)

	cfg := types.DevConfig{Kind: types.KindNode, Command: "node -v", Cwd: dir}
	if _, err := m.StartServer(StartOptions{ProjectID: "node-runtime", ProjectPath: dir, Config: cfg}); err != nil {
		t.Fatalf("启动失败: %v", err)
	}

	info := waitForStatus(t, m, "node-runtime", types.ServerStatusCompleted)
	if info.Runtime != target.Version {
		t.Fatalf("应记录运行时 %s，实际 %+v", target.Version, info.Runtime)
	}
	if !strings.Contains(emitter.text("node-runtime"), "v"+target.Version) {
		t.Fatalf("子进程应在注入的运行时上运行（期望 v%s），实际输出: %q", target.Version, emitter.text("node-runtime"))
	}
}
