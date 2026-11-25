package process

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/config"
	noderuntime "github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/runtime"
	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"
)

const (
	bufferFlushIntervalMS      = 100
	dependencyInstallTimeoutMS = 5 * 60 * 1000
	startupTimeoutMS           = 10 * 1000
	stopAllTimeoutMS           = 10 * 1000
	stopWaitIntervalMS         = 100
	createNoWindow             = 0x08000000
)

// localURLRegex 从 dev server 日志中提取本地端口
var localURLRegex = regexp.MustCompile(`(?:Local|local|localhost|127\.0\.0\.1)[\s:]+(?:http://)?(?:localhost|127\.0\.0\.1):(\d+)`)

// ansiRegex 剥离 ANSI 转义序列
var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

// envProtectedKeys 禁止被项目 env 覆盖的系统关键变量
var envProtectedKeys = map[string]struct{}{
	"PATH": {}, "Path": {}, "path": {},
	"SYSTEMROOT": {}, "SystemRoot": {},
	"SYSTEMDRIVE": {}, "SystemDrive": {},
	"COMSPEC": {}, "WINDIR": {},
	"NODE_OPTIONS": {}, "NODE_PATH": {},
	"LD_LIBRARY_PATH": {}, "DYLD_LIBRARY_PATH": {},
}

// Emitter 进程事件发射接口（由 Wails runtime 实现）
type Emitter interface {
	Emit(event string, data any)
}

// noopEmitter 默认空实现，便于无 UI 单测
type noopEmitter struct{}

func (noopEmitter) Emit(string, any) {}

// StartOptions 启动一个项目的入参
type StartOptions struct {
	ProjectID string
	// ProjectPath node 项目为目录，脚本项目为 .bat/.cmd 文件
	ProjectPath string
	Config      types.DevConfig
	// RuntimeOverride 本机历史里保存的版本覆盖值，优先级高于项目版本声明
	RuntimeOverride string
}

// errStartCanceled 表示启动过程中被用户停止（不是启动失败）。
var errStartCanceled = errors.New("start canceled")

// managedProcess 单个项目的进程运行态
type managedProcess struct {
	cmdMu       sync.Mutex
	cmd         *exec.Cmd
	pid         uint32
	startTimeMS uint64
	infoMu      sync.Mutex
	info        types.ServerProcess
	outputMu    sync.Mutex
	outputBuffer string
	flushScheduled atomic.Bool
	urlDetected    atomic.Bool
	// killOnce 保证只杀一次
	killOnce sync.Once
	// stopping 标记进程正在被主动停止；置位后读管道报错视为正常终止，不上报
	stopping atomic.Bool
	// stopRequested 在安装/启动任一阶段被停止时置位；stopCh 用于打断安装等待
	stopRequested atomic.Bool
	stopOnce      sync.Once
	stopCh        chan struct{}
	// installing/installCmd/installDone 让 StopServer 在依赖安装阶段也能同步取消
	installing      atomic.Bool
	installMu       sync.Mutex
	installCmd      *exec.Cmd
	installDone     chan struct{}
	installDoneOnce sync.Once
	// exited 在 cmd.Wait 返回后置位，避免启动守护协程无锁读 ProcessState
	exited  atomic.Bool
	readers sync.WaitGroup
}

// requestStop 幂等地置位停止标志并唤醒安装阶段的等待。
func (mp *managedProcess) requestStop() {
	mp.stopping.Store(true)
	mp.stopRequested.Store(true)
	mp.stopOnce.Do(func() {
		if mp.stopCh != nil {
			close(mp.stopCh)
		}
	})
}

func (mp *managedProcess) setCommand(cmd *exec.Cmd, pid uint32) {
	mp.cmdMu.Lock()
	mp.cmd = cmd
	mp.pid = pid
	mp.cmdMu.Unlock()
}

func (mp *managedProcess) command() (*exec.Cmd, uint32) {
	mp.cmdMu.Lock()
	defer mp.cmdMu.Unlock()
	return mp.cmd, mp.pid
}

func (mp *managedProcess) setInstallCommand(cmd *exec.Cmd) {
	mp.installMu.Lock()
	mp.installCmd = cmd
	mp.installMu.Unlock()
}

func (mp *managedProcess) installCommand() *exec.Cmd {
	mp.installMu.Lock()
	defer mp.installMu.Unlock()
	return mp.installCmd
}

func (mp *managedProcess) markInstallDone() {
	mp.installDoneOnce.Do(func() {
		if mp.installDone != nil {
			close(mp.installDone)
		}
	})
}

// waitReaders 有上限地等待 stdout/stderr 读取协程排空管道，
// 避免孙进程长期占用写端时把退出监控永远挂住。
func (mp *managedProcess) waitReaders(timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		mp.readers.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
	}
}

// isTerminal 判断状态是否已终结（无需再杀进程）
func isTerminal(status types.ServerStatus) bool {
	switch status {
	case types.ServerStatusStopped, types.ServerStatusCompleted, types.ServerStatusError:
		return true
	}
	return false
}

// Manager 多项目进程管理器
type Manager struct {
	mu        sync.Mutex
	processes map[string]*managedProcess
	emitter   Emitter

	runtimeMu     sync.RWMutex
	available     []noderuntime.Runtime
	systemRuntime noderuntime.Runtime
	runtimesReady bool
}

// New 创建进程管理器
func New(emitter Emitter) *Manager {
	if emitter == nil {
		emitter = noopEmitter{}
	}
	return &Manager{
		processes: make(map[string]*managedProcess),
		emitter:   emitter,
	}
}

// SetEmitter 运行时替换事件发射器（Wails startup 后注入）
func (m *Manager) SetEmitter(emitter Emitter) {
	if emitter == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emitter = emitter
}

// SetRuntimes 注入本机探测到的 Node 运行时列表（App 启动时调用一次）
func (m *Manager) SetRuntimes(available []noderuntime.Runtime, system noderuntime.Runtime) {
	m.runtimeMu.Lock()
	defer m.runtimeMu.Unlock()
	m.available = noderuntime.FilterUsable(available)
	m.systemRuntime = system
	m.runtimesReady = true
}

// Runtimes 返回已探测的运行时列表与系统默认运行时
func (m *Manager) Runtimes() ([]noderuntime.Runtime, noderuntime.Runtime) {
	m.runtimeMu.RLock()
	defer m.runtimeMu.RUnlock()
	return m.available, m.systemRuntime
}

// runtimeState 取运行时列表；未注入时按需探测，保证单测与无 UI 场景可用
func (m *Manager) runtimeState() ([]noderuntime.Runtime, noderuntime.Runtime) {
	m.runtimeMu.RLock()
	ready := m.runtimesReady
	available := m.available
	system := m.systemRuntime
	m.runtimeMu.RUnlock()
	if ready {
		return available, system
	}

	available, _ = noderuntime.Discover(os.Getenv("NVM_HOME"))
	available = noderuntime.FilterUsable(available)
	system = noderuntime.System()

	m.runtimeMu.Lock()
	m.available = available
	m.systemRuntime = system
	m.runtimesReady = true
	m.runtimeMu.Unlock()
	return available, system
}

// reloadRuntimes 重新探测运行时，用于处理应用运行期间版本被卸载的情况。
func (m *Manager) reloadRuntimes() {
	available, _ := noderuntime.Discover(os.Getenv("NVM_HOME"))
	m.SetRuntimes(available, noderuntime.System())
}

// ResolveRuntime 解析某个项目将使用的运行时（不启动进程，供界面预览）
func (m *Manager) ResolveRuntime(projectPath, configVersion, historyVersion string) (noderuntime.Resolution, noderuntime.Spec, error) {
	spec, hasSpec := noderuntime.ReadSpec(projectPath)
	available, system := m.runtimeState()
	resolution, err := noderuntime.Request{
		Available:      available,
		ConfigVersion:  configVersion,
		HistoryVersion: historyVersion,
		Spec:           spec,
		HasSpec:        hasSpec,
		System:         system,
	}.Resolve()
	return resolution, spec, err
}

// StartServer 启动项目（必要时先装依赖），返回启动瞬间的进程信息。
//
// 进程占位会在依赖安装前登记到 m.processes，这样安装期间的 StopServer /
// StopAllServers 能取消安装，而不是返回“project is not running”。
func (m *Manager) StartServer(opts StartOptions) (types.ServerProcess, error) {
	cfg := opts.Config
	kind := cfg.Kind.Normalize()

	projectPath, err := config.SanitizePath(opts.ProjectPath)
	if err != nil {
		return types.ServerProcess{}, err
	}
	if kind == types.KindScript {
		// 文件夹方式添加的脚本项目，ProjectPath 是目录，真正的脚本在 cfg.Command 里。
		projectPath, err = resolveScriptPath(projectPath, cfg.Command)
		if err != nil {
			return types.ServerProcess{}, err
		}
	} else if err := config.ValidateProjectDirectory(projectPath); err != nil {
		return types.ServerProcess{}, err
	}
	if err := config.ValidateDevConfigOrError(cfg); err != nil {
		return types.ServerProcess{}, err
	}

	workDir := strings.TrimSpace(cfg.Cwd)
	if kind == types.KindScript && workDir == "" {
		workDir = filepath.Dir(projectPath)
	}
	workDir, err = config.SanitizePath(workDir)
	if err != nil {
		return types.ServerProcess{}, err
	}
	if err := config.ValidateDirectory(workDir); err != nil {
		return types.ServerProcess{}, err
	}

	// 运行时解析只对 node 项目做：版本没装要报错，绝不静默回退
	var (
		resolution noderuntime.Resolution
		spec       noderuntime.Spec
		runtimeDir string
		runVersion string
		runSource  string
		runNote    string
	)
	if kind == types.KindNode {
		resolution, spec, err = m.ResolveRuntime(projectPath, cfg.Runtime, opts.RuntimeOverride)
		if err != nil {
			return types.ServerProcess{}, err
		}
		runtimeDir = resolution.Runtime.Dir
		runVersion, runSource, runNote = describeRuntime(resolution, spec)

		// 运行时列表在应用启动时缓存；用户可能在运行期间卸载了版本。
		// 注入前重新校验目录，过期时重新探测并解析一次。
		if runtimeDir != "" && !noderuntime.Runtime{Dir: runtimeDir}.Usable() {
			m.reloadRuntimes()
			resolution, spec, err = m.ResolveRuntime(projectPath, cfg.Runtime, opts.RuntimeOverride)
			if err != nil {
				return types.ServerProcess{}, err
			}
			runtimeDir = resolution.Runtime.Dir
			runVersion, runSource, runNote = describeRuntime(resolution, spec)
			if runtimeDir != "" && !noderuntime.Runtime{Dir: runtimeDir}.Usable() {
				return types.ServerProcess{}, fmt.Errorf("运行时目录不可用: %s", runtimeDir)
			}
		}
	}

	startedAt := currentTimestampMS()
	mp := &managedProcess{
		startTimeMS: startedAt,
		stopCh:      make(chan struct{}),
		installDone: make(chan struct{}),
		info: types.ServerProcess{
			ProjectID:     opts.ProjectID,
			Status:        types.ServerStatusStarting,
			StartTime:     startedAt,
			Runtime:       runVersion,
			RuntimeSource: runSource,
			RuntimeNote:   runNote,
		},
	}

	// 检查并登记占位进程必须原子，否则两个并发 StartServer 会同时通过检查。
	m.mu.Lock()
	if existing := m.processes[opts.ProjectID]; existing != nil {
		existing.infoMu.Lock()
		st := existing.info.Status
		existing.infoMu.Unlock()
		if st == types.ServerStatusStarting || st == types.ServerStatusRunning {
			m.mu.Unlock()
			return types.ServerProcess{}, fmt.Errorf("project is already running")
		}
	}
	m.processes[opts.ProjectID] = mp
	m.mu.Unlock()

	if kind == types.KindNode {
		if err := m.installDependenciesIfNeeded(mp, projectPath, runtimeDir); err != nil {
			if errors.Is(err, errStartCanceled) || mp.stopRequested.Load() {
				m.finishStart(mp, types.ServerStatusStopped, nil)
				return m.serverProcessSnapshot(mp), nil
			}
			m.finishStart(mp, types.ServerStatusError, nil)
			return types.ServerProcess{}, err
		}
	}
	if mp.stopRequested.Load() {
		m.finishStart(mp, types.ServerStatusStopped, nil)
		return m.serverProcessSnapshot(mp), nil
	}

	rawCommand, err := buildCommand(kind, projectPath, cfg)
	if err != nil {
		return m.abortStart(mp, err)
	}

	cmd := createShellCommand(rawCommand)
	cmd.Dir = workDir
	m.applyEnvironment(cmd, opts.ProjectID, cfg.Env, runtimeDir)

	stdoutR, stdoutW, err := os.Pipe()
	if err != nil {
		return m.abortStart(mp, fmt.Errorf("failed to start server process: %w", err))
	}
	stderrR, stderrW, err := os.Pipe()
	if err != nil {
		_ = stdoutR.Close()
		_ = stdoutW.Close()
		return m.abortStart(mp, fmt.Errorf("failed to start server process: %w", err))
	}
	cmd.Stdout = stdoutW
	cmd.Stderr = stderrW

	if err := cmd.Start(); err != nil {
		_ = stdoutR.Close()
		_ = stdoutW.Close()
		_ = stderrR.Close()
		_ = stderrW.Close()
		return m.abortStart(mp, fmt.Errorf("failed to start server process: %w", err))
	}
	// 父进程关闭写端；子进程持有自己的写端。这样 cmd.Wait 不会提前关闭读端，
	// 读取协程能把管道里剩余的输出（常是真正的报错行）读完。
	_ = stdoutW.Close()
	_ = stderrW.Close()

	pid := uint32(cmd.Process.Pid)
	mp.setCommand(cmd, pid)
	mp.infoMu.Lock()
	mp.info.PID = pid
	mp.info.StartTime = currentTimestampMS()
	mp.startTimeMS = mp.info.StartTime
	mp.infoMu.Unlock()

	// 启动过程中可能已经被 StopServer 取消（它此时还看不到 cmd）。
	if mp.stopRequested.Load() {
		_ = m.killManaged(mp)
	}

	if runNote != "" {
		m.emitOutput(opts.ProjectID, "[runtime] "+runNote+"\n")
	}

	mp.readers.Add(2)
	go func() {
		defer mp.readers.Done()
		m.spawnOutputReader(opts.ProjectID, stdoutR, mp)
	}()
	go func() {
		defer mp.readers.Done()
		m.spawnOutputReader(opts.ProjectID, stderrR, mp)
	}()
	go m.spawnStartupGuard(opts.ProjectID, mp)
	go m.spawnExitMonitor(opts.ProjectID, mp, cmd)

	return m.serverProcessSnapshot(mp), nil
}

func (m *Manager) serverProcessSnapshot(mp *managedProcess) types.ServerProcess {
	mp.infoMu.Lock()
	defer mp.infoMu.Unlock()
	return mp.info
}

// finishStart 写入启动阶段的终态（安装失败/被停止等），并广播状态。
// 已经是终态时不再覆盖，避免“用户已停止”被后续错误改成 error。
func (m *Manager) finishStart(mp *managedProcess, status types.ServerStatus, exitCode *int) {
	mp.infoMu.Lock()
	if isTerminal(mp.info.Status) {
		mp.infoMu.Unlock()
		return
	}
	mp.info.Status = status
	if exitCode != nil {
		mp.info.ExitCode = exitCode
	}
	mp.info.DurationMS = currentTimestampMS() - mp.startTimeMS
	info := mp.info
	mp.infoMu.Unlock()
	m.emitStatusChange(info)
}

// abortStart 处理启动链路上的错误：若用户已经请求停止，返回 stopped 而不是 error。
func (m *Manager) abortStart(mp *managedProcess, err error) (types.ServerProcess, error) {
	if mp.stopRequested.Load() {
		m.finishStart(mp, types.ServerStatusStopped, nil)
		return m.serverProcessSnapshot(mp), nil
	}
	m.finishStart(mp, types.ServerStatusError, nil)
	return types.ServerProcess{}, err
}

// resolveScriptPath 解析脚本项目的实际执行文件。
// ProjectPath 可能来自文件选择（脚本路径），也可能来自目录选择（含 dev-config.json 的目录）；
// 配置里的 command 是脚本路径，相对路径按项目目录解析。
func resolveScriptPath(projectPath, command string) (string, error) {
	target := strings.TrimSpace(command)
	if target == "" {
		target = projectPath
	}
	if !filepath.IsAbs(target) {
		base := projectPath
		if info, err := os.Stat(projectPath); err == nil && !info.IsDir() {
			base = filepath.Dir(projectPath)
		}
		target = filepath.Join(base, target)
	}
	target, err := config.SanitizePath(target)
	if err != nil {
		return "", err
	}
	if err := config.ValidateScriptTarget(target); err != nil {
		return "", err
	}
	return target, nil
}

// describeRuntime 把解析结果转成界面可读的版本/来源/提示
func describeRuntime(res noderuntime.Resolution, spec noderuntime.Spec) (version, source, note string) {
	note = res.Note
	switch res.Origin {
	case noderuntime.OriginConfig:
		return res.Runtime.Version, "dev-config.json", note
	case noderuntime.OriginHistory:
		return res.Runtime.Version, "本机记录", note
	case noderuntime.OriginSpec:
		return res.Runtime.Version, spec.Source, note
	default:
		return "", "系统默认", note
	}
}

// buildCommand 构造最终交给 cmd /C 或 sh -c 的命令行
func buildCommand(kind types.ProjectKind, projectPath string, cfg types.DevConfig) (string, error) {
	if kind == types.KindScript {
		// 脚本项目：直接执行脚本本身，参数原样追加
		raw := quoteIfNeeded(projectPath)
		if args := strings.TrimSpace(cfg.Args); args != "" {
			raw += " " + args
		}
		return raw, nil
	}
	return config.SanitizeCommand(cfg.Command)
}

// quoteIfNeeded 路径含空格或 cmd 元字符时加引号，避免 cmd /C 拆词/二次解析
func quoteIfNeeded(value string) string {
	// cmd.exe 会把 & | < > ^ ( ) 当作命令分隔符/控制字符；路径含这些字符时也必须加引号。
	if strings.ContainsAny(value, " \t&|<>^()") && !strings.HasPrefix(value, `"`) {
		return `"` + value + `"`
	}
	return value
}

// applyEnvironment 组装子进程环境：系统环境 + 运行时目录前置到 PATH + 项目自定义 env
func (m *Manager) applyEnvironment(cmd *exec.Cmd, projectID string, extra map[string]string, runtimeDir string) {
	if runtimeDir == "" && len(extra) == 0 {
		return // 完全继承父进程环境
	}

	env := append([]string{}, os.Environ()...)
	if runtimeDir != "" {
		env = prependPath(env, runtimeDir)
	}
	for key, value := range extra {
		if _, protected := envProtectedKeys[key]; protected {
			m.emitOutput(projectID, fmt.Sprintf("[system] skipped protected environment variable \"%s\"\n", key))
			continue
		}
		env = append(env, key+"="+value)
	}
	cmd.Env = env
}

// prependPath 把目录插到 PATH 最前面（Windows 环境变量名大小写不敏感）
func prependPath(env []string, dir string) []string {
	separator := string(os.PathListSeparator)
	for i, kv := range env {
		key, value, found := strings.Cut(kv, "=")
		if !found || !strings.EqualFold(key, "PATH") {
			continue
		}
		env[i] = key + "=" + dir + separator + value
		return env
	}
	return append(env, "PATH="+dir)
}

// StopServer 停止指定项目进程（Windows 使用 taskkill /T /F）。
// 依赖安装阶段进程还没有 cmd，此时取消安装并终止安装进程树。
func (m *Manager) StopServer(projectID string) error {
	mp := m.getProcess(projectID)
	if mp == nil {
		return fmt.Errorf("project is not running")
	}
	mp.infoMu.Lock()
	status := mp.info.Status
	mp.infoMu.Unlock()
	if isTerminal(status) {
		return nil // 已经结束，无需再杀
	}

	mp.requestStop()
	cmd, _ := mp.command()
	if cmd == nil || cmd.Process == nil {
		// 安装阶段：requestStop 会关闭 stopCh，install 协程据此杀掉进程树。
		if mp.installing.Load() {
			select {
			case <-mp.installDone:
			case <-time.After(2 * time.Second):
			}
			if installCmd := mp.installCommand(); installCmd != nil && installCmd.Process != nil {
				_ = killProcessTree(uint32(installCmd.Process.Pid))
			}
		}
		m.finishStart(mp, types.ServerStatusStopped, nil)
		return nil
	}
	return m.killManaged(mp)
}

// GetServerStatus 查询项目状态；未知项目返回 idle
func (m *Manager) GetServerStatus(projectID string) types.ServerStatus {
	mp := m.getProcess(projectID)
	if mp == nil {
		return types.ServerStatusIdle
	}
	mp.infoMu.Lock()
	defer mp.infoMu.Unlock()
	return mp.info.Status
}

// GetServerProcess 查询项目进程详情（含退出码、耗时、运行时）
func (m *Manager) GetServerProcess(projectID string) types.ServerProcess {
	mp := m.getProcess(projectID)
	if mp == nil {
		return types.ServerProcess{ProjectID: projectID, Status: types.ServerStatusIdle}
	}
	mp.infoMu.Lock()
	defer mp.infoMu.Unlock()
	return mp.info
}

func (m *Manager) getProcess(projectID string) *managedProcess {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.processes[projectID]
}

// StopAllServers 停止全部运行中的项目并等待退出
func (m *Manager) StopAllServers() error {
	m.mu.Lock()
	ids := make([]string, 0, len(m.processes))
	for id, mp := range m.processes {
		mp.infoMu.Lock()
		running := !isTerminal(mp.info.Status)
		mp.infoMu.Unlock()
		if running {
			ids = append(ids, id)
		}
	}
	m.mu.Unlock()

	for _, id := range ids {
		_ = m.StopServer(id)
	}
	return m.waitForAllStopped(time.Duration(stopAllTimeoutMS) * time.Millisecond)
}

func (m *Manager) killManaged(mp *managedProcess) error {
	var killErr error
	mp.killOnce.Do(func() {
		// 先置位停止标志，使随后关闭管道触发的读错误被识别为正常终止。
		mp.requestStop()
		cmd, pid := mp.command()
		if pid != 0 {
			if err := killProcessTree(pid); err == nil {
				return
			}
		}
		if cmd != nil && cmd.Process != nil {
			killErr = cmd.Process.Kill()
		}
	})
	return killErr
}

// killProcessTree 终止整个进程树。Windows 用 taskkill /T /F，
// 避免只杀 cmd.exe 而留下 npm/node 子进程继续运行。
func killProcessTree(pid uint32) error {
	if pid == 0 {
		return fmt.Errorf("invalid pid")
	}
	if runtime.GOOS == "windows" {
		cmd := exec.Command("taskkill", "/pid", fmt.Sprintf("%d", pid), "/T", "/F")
		hideWindow(cmd)
		cmd.Stdout = io.Discard
		cmd.Stderr = io.Discard
		return cmd.Run()
	}
	process, err := os.FindProcess(int(pid))
	if err != nil {
		return err
	}
	return process.Kill()
}

func (m *Manager) waitForAllStopped(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		if m.runningCount() == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("still waiting for %d process(es) to stop", m.runningCount())
		}
		time.Sleep(time.Duration(stopWaitIntervalMS) * time.Millisecond)
	}
}

// runningCount 统计仍处于 starting/running 的进程数。
// processes 会保留已结束的记录（供界面显示退出码/耗时），因此不能按长度判断。
func (m *Manager) runningCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	count := 0
	for _, mp := range m.processes {
		mp.infoMu.Lock()
		status := mp.info.Status
		mp.infoMu.Unlock()
		if status == types.ServerStatusStarting || status == types.ServerStatusRunning {
			count++
		}
	}
	return count
}

func (m *Manager) installDependenciesIfNeeded(mp *managedProcess, projectPath, runtimeDir string) error {
	projectID := mp.info.ProjectID
	mp.installing.Store(true)
	defer func() {
		mp.installing.Store(false)
		mp.setInstallCommand(nil)
		mp.markInstallDone()
	}()

	if mp.stopRequested.Load() {
		return errStartCanceled
	}
	if !fileExists(filepath.Join(projectPath, "package.json")) || fileExists(filepath.Join(projectPath, "node_modules")) {
		return nil
	}

	pm := config.DetectPackageManager(projectPath)
	m.emitOutput(projectID, fmt.Sprintf("\nMissing `node_modules`. Installing dependencies with `%s`...\nCommand: %s install\n\n", pm, pm))

	cmd := createShellCommand(pm + " install")
	cmd.Dir = projectPath
	// 依赖安装使用同一个运行时，否则 esbuild 之类的原生模块会按错误的 ABI 编译
	m.applyEnvironment(cmd, projectID, nil, runtimeDir)

	stdoutR, stdoutW, err := os.Pipe()
	if err != nil {
		return fmt.Errorf("failed to start dependency install: %w", err)
	}
	stderrR, stderrW, err := os.Pipe()
	if err != nil {
		_ = stdoutR.Close()
		_ = stdoutW.Close()
		return fmt.Errorf("failed to start dependency install: %w", err)
	}
	cmd.Stdout = stdoutW
	cmd.Stderr = stderrW

	if err := cmd.Start(); err != nil {
		_ = stdoutR.Close()
		_ = stdoutW.Close()
		_ = stderrR.Close()
		_ = stderrW.Close()
		return fmt.Errorf("failed to start dependency install: %w", err)
	}
	// 父进程关闭写端；子进程持有自己的写端，Wait 不会提前关闭读端。
	_ = stdoutW.Close()
	_ = stderrW.Close()
	mp.setInstallCommand(cmd)

	var (
		bufMu          sync.Mutex
		buffer         string
		flushScheduled atomic.Bool
	)
	readInstall := func(r io.ReadCloser) {
		defer r.Close()
		b := make([]byte, 4096)
		for {
			n, err := r.Read(b)
			if n > 0 {
				if mp.stopRequested.Load() {
					return
				}
				chunk := ansiRegex.ReplaceAllString(string(b[:n]), "")
				bufMu.Lock()
				buffer += chunk
				bufMu.Unlock()
				m.scheduleInstallFlush(projectID, &bufMu, &buffer, &flushScheduled)
			}
			if err != nil {
				return
			}
		}
	}
	go readInstall(stdoutR)
	go readInstall(stderrR)

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	timeout := time.NewTimer(time.Duration(dependencyInstallTimeoutMS) * time.Millisecond)
	defer timeout.Stop()

	select {
	case err := <-done:
		if mp.stopRequested.Load() {
			return errStartCanceled
		}
		m.flushBufferNow(projectID, &bufMu, &buffer)
		if err != nil {
			return fmt.Errorf("dependency install exited with error: %w", err)
		}
		m.emitOutput(projectID, "\nDependencies installed. Starting development server...\n\n")
		return nil
	case <-mp.stopCh:
		// 用户停止/退出：杀整个安装进程树，避免 node.exe 继续写 node_modules。
		_ = killProcessTree(uint32(cmd.Process.Pid))
		m.flushBufferNow(projectID, &bufMu, &buffer)
		return errStartCanceled
	case <-timeout.C:
		_ = killProcessTree(uint32(cmd.Process.Pid))
		m.flushBufferNow(projectID, &bufMu, &buffer)
		return fmt.Errorf("dependency install timed out")
	}
}

func (m *Manager) scheduleInstallFlush(projectID string, mu *sync.Mutex, buffer *string, scheduled *atomic.Bool) {
	if !scheduled.CompareAndSwap(false, true) {
		return
	}
	go func() {
		time.Sleep(time.Duration(bufferFlushIntervalMS) * time.Millisecond)
		mu.Lock()
		pending := *buffer
		*buffer = ""
		mu.Unlock()
		scheduled.Store(false)
		if pending != "" {
			m.emitOutput(projectID, pending)
		}
		mu.Lock()
		hasMore := *buffer != ""
		mu.Unlock()
		if hasMore {
			m.scheduleInstallFlush(projectID, mu, buffer, scheduled)
		}
	}()
}

func (m *Manager) flushBufferNow(projectID string, mu *sync.Mutex, buffer *string) {
	mu.Lock()
	pending := *buffer
	*buffer = ""
	mu.Unlock()
	if pending != "" {
		m.emitOutput(projectID, pending)
	}
}

func (m *Manager) spawnOutputReader(projectID string, r io.ReadCloser, mp *managedProcess) {
	defer r.Close()
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			raw := string(buf[:n])
			clean := ansiRegex.ReplaceAllString(raw, "")
			m.markRunningIfNeeded(projectID, mp)
			m.detectURLIfNeeded(projectID, clean, mp)
			m.queueOutput(projectID, mp, clean)
		}
		if err != nil {
			// EOF 是正常结束；进程被停止后管道关闭引发的读错误也属正常，不上报。
			if err != io.EOF && !mp.stopping.Load() && !isClosedPipeError(err) {
				m.queueOutput(projectID, mp, fmt.Sprintf("\noutput read error: %v\n", err))
			}
			return
		}
	}
}

func (m *Manager) spawnStartupGuard(projectID string, mp *managedProcess) {
	time.Sleep(time.Duration(startupTimeoutMS) * time.Millisecond)

	mp.infoMu.Lock()
	stillStarting := mp.info.Status == types.ServerStatusStarting
	mp.infoMu.Unlock()
	if !stillStarting {
		return
	}

	next := types.ServerStatusRunning
	if mp.exited.Load() {
		next = types.ServerStatusError
	}

	mp.infoMu.Lock()
	if mp.info.Status != types.ServerStatusStarting {
		mp.infoMu.Unlock()
		return
	}
	mp.info.Status = next
	info := mp.info
	mp.infoMu.Unlock()

	m.emitStatusChange(info)
}

func (m *Manager) spawnExitMonitor(projectID string, mp *managedProcess, cmd *exec.Cmd) {
	waitErr := cmd.Wait()
	mp.exited.Store(true)

	// 有上限地等读取协程排空管道：Wait 不再关闭读端，最后一段报错输出不会丢。
	mp.waitReaders(2 * time.Second)
	m.flushOutputNow(projectID, mp)

	exitCode := -1
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	duration := currentTimestampMS() - mp.startTimeMS

	status := types.ServerStatusCompleted
	switch {
	case mp.stopping.Load():
		status = types.ServerStatusStopped
	case waitErr != nil || exitCode != 0:
		status = types.ServerStatusError
	}

	mp.infoMu.Lock()
	mp.info.Status = status
	mp.info.ExitCode = &exitCode
	mp.info.DurationMS = duration
	info := mp.info
	mp.infoMu.Unlock()

	// 保留进程记录：界面需要显示退出码与耗时，重跑时会覆盖
	m.emitStatusChange(info)
}

// emitStatusChange 广播状态变更（带退出码/耗时/运行时，前端据此更新卡片）
func (m *Manager) emitStatusChange(info types.ServerProcess) {
	m.emit(types.EventServerStatusChange, types.StatusChangePayload{
		ProjectID:     info.ProjectID,
		Status:        info.Status,
		ExitCode:      info.ExitCode,
		DurationMS:    info.DurationMS,
		Runtime:       info.Runtime,
		RuntimeSource: info.RuntimeSource,
		RuntimeNote:   info.RuntimeNote,
	})
}

func (m *Manager) markRunningIfNeeded(projectID string, mp *managedProcess) {
	mp.infoMu.Lock()
	shouldEmit := false
	if mp.info.Status == types.ServerStatusStarting {
		mp.info.Status = types.ServerStatusRunning
		shouldEmit = true
	}
	mp.infoMu.Unlock()
	if shouldEmit {
		m.emit(types.EventServerStatusChange, types.StatusChangePayload{
			ProjectID: projectID,
			Status:    types.ServerStatusRunning,
		})
	}
}

func (m *Manager) detectURLIfNeeded(projectID, output string, mp *managedProcess) {
	if mp.urlDetected.Load() {
		return
	}
	matches := localURLRegex.FindStringSubmatch(output)
	if len(matches) < 2 {
		return
	}
	if mp.urlDetected.CompareAndSwap(false, true) {
		m.emit(types.EventServerURLDetected, types.UrlDetectedPayload{
			ProjectID: projectID,
			URL:       "http://localhost:" + matches[1],
		})
	}
}

func (m *Manager) queueOutput(projectID string, mp *managedProcess, chunk string) {
	if chunk == "" {
		return
	}
	mp.outputMu.Lock()
	mp.outputBuffer += chunk
	mp.outputMu.Unlock()
	m.scheduleOutputFlush(projectID, mp)
}

func (m *Manager) scheduleOutputFlush(projectID string, mp *managedProcess) {
	if !mp.flushScheduled.CompareAndSwap(false, true) {
		return
	}
	go func() {
		time.Sleep(time.Duration(bufferFlushIntervalMS) * time.Millisecond)
		mp.outputMu.Lock()
		pending := mp.outputBuffer
		mp.outputBuffer = ""
		mp.outputMu.Unlock()
		mp.flushScheduled.Store(false)
		if pending != "" {
			m.emitOutput(projectID, pending)
		}
		mp.outputMu.Lock()
		hasMore := mp.outputBuffer != ""
		mp.outputMu.Unlock()
		if hasMore {
			m.scheduleOutputFlush(projectID, mp)
		}
	}()
}

func (m *Manager) flushOutputNow(projectID string, mp *managedProcess) {
	mp.outputMu.Lock()
	pending := mp.outputBuffer
	mp.outputBuffer = ""
	mp.outputMu.Unlock()
	if pending != "" {
		m.emitOutput(projectID, pending)
	}
}

func (m *Manager) emitOutput(projectID, output string) {
	m.emit(types.EventServerOutput, types.OutputPayload{ProjectID: projectID, Output: output})
}

func (m *Manager) emit(event string, data any) {
	m.mu.Lock()
	em := m.emitter
	m.mu.Unlock()
	if em != nil {
		em.Emit(event, data)
	}
}

// ExtractLocalURL 导出 URL 提取逻辑供单测
func ExtractLocalURL(output string) (string, bool) {
	matches := localURLRegex.FindStringSubmatch(output)
	if len(matches) < 2 {
		return "", false
	}
	return "http://localhost:" + matches[1], true
}

func currentTimestampMS() uint64 {
	return uint64(time.Now().UnixMilli())
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// isClosedPipeError 判断读错误是否源于管道/文件已关闭。
// 进程被停止或自行退出时，stdout/stderr 管道会被关闭，
// 正在阻塞的 Read 会返回 "file already closed" 一类错误——
// 这属于正常终止的副产品，不应作为错误输出上报给用户。
func isClosedPipeError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, os.ErrClosed) || errors.Is(err, fs.ErrClosed) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "file already closed") ||
		strings.Contains(msg, "closed pipe")
}
