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

// managedProcess 单个项目的进程运行态
type managedProcess struct {
	pid            uint32
	cmd            *exec.Cmd
	startTimeMS    uint64
	infoMu         sync.Mutex
	info           types.ServerProcess
	outputMu       sync.Mutex
	outputBuffer   string
	flushScheduled atomic.Bool
	urlDetected    atomic.Bool
	// killOnce 保证只杀一次
	killOnce sync.Once
	// stopping 标记进程正在被主动停止；置位后读管道报错视为正常终止，不上报
	stopping atomic.Bool
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
	m.available = available
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
	system = noderuntime.System()

	m.runtimeMu.Lock()
	m.available = available
	m.systemRuntime = system
	m.runtimesReady = true
	m.runtimeMu.Unlock()
	return available, system
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

// StartServer 启动项目（必要时先装依赖），返回启动瞬间的进程信息
func (m *Manager) StartServer(opts StartOptions) (types.ServerProcess, error) {
	cfg := opts.Config
	kind := cfg.Kind.Normalize()

	projectPath, err := config.SanitizePath(opts.ProjectPath)
	if err != nil {
		return types.ServerProcess{}, err
	}
	if kind == types.KindScript {
		if err := config.ValidateScriptTarget(projectPath); err != nil {
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

	if existing := m.getProcess(opts.ProjectID); existing != nil {
		existing.infoMu.Lock()
		st := existing.info.Status
		existing.infoMu.Unlock()
		if st == types.ServerStatusStarting || st == types.ServerStatusRunning {
			return types.ServerProcess{}, fmt.Errorf("project is already running")
		}
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
	}

	if kind == types.KindNode {
		if err := m.installDependenciesIfNeeded(opts.ProjectID, projectPath, runtimeDir); err != nil {
			return types.ServerProcess{}, err
		}
	}

	rawCommand, err := buildCommand(kind, projectPath, cfg)
	if err != nil {
		return types.ServerProcess{}, err
	}

	cmd := createShellCommand(rawCommand)
	cmd.Dir = workDir
	cmd.Stdout = nil
	cmd.Stderr = nil
	m.applyEnvironment(cmd, opts.ProjectID, cfg.Env, runtimeDir)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return types.ServerProcess{}, fmt.Errorf("failed to start server process: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return types.ServerProcess{}, fmt.Errorf("failed to start server process: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return types.ServerProcess{}, fmt.Errorf("failed to start server process: %w", err)
	}

	pid := uint32(cmd.Process.Pid)
	startedAt := currentTimestampMS()
	mp := &managedProcess{
		pid:         pid,
		cmd:         cmd,
		startTimeMS: startedAt,
		info: types.ServerProcess{
			ProjectID:     opts.ProjectID,
			PID:           pid,
			Status:        types.ServerStatusStarting,
			StartTime:     startedAt,
			Runtime:       runVersion,
			RuntimeSource: runSource,
			RuntimeNote:   runNote,
		},
	}

	m.mu.Lock()
	m.processes[opts.ProjectID] = mp
	m.mu.Unlock()

	if runNote != "" {
		m.emitOutput(opts.ProjectID, "[runtime] "+runNote+"\n")
	}

	go m.spawnOutputReader(opts.ProjectID, stdout, mp)
	go m.spawnOutputReader(opts.ProjectID, stderr, mp)
	go m.spawnStartupGuard(opts.ProjectID, mp)
	go m.spawnExitMonitor(opts.ProjectID, mp)

	mp.infoMu.Lock()
	info := mp.info
	mp.infoMu.Unlock()
	return info, nil
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

// quoteIfNeeded 路径含空格时加引号，避免 cmd /C 拆词
func quoteIfNeeded(value string) string {
	if strings.ContainsAny(value, " \t") && !strings.HasPrefix(value, `"`) {
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

// StopServer 停止指定项目进程（Windows 使用 taskkill /T /F）
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
		mp.stopping.Store(true)
		if runtime.GOOS == "windows" {
			cmd := exec.Command("taskkill", "/pid", fmt.Sprintf("%d", mp.pid), "/T", "/F")
			hideWindow(cmd)
			cmd.Stdout = io.Discard
			cmd.Stderr = io.Discard
			if err := cmd.Run(); err == nil {
				return
			}
		}
		if mp.cmd != nil && mp.cmd.Process != nil {
			killErr = mp.cmd.Process.Kill()
		}
	})
	return killErr
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

func (m *Manager) installDependenciesIfNeeded(projectID, projectPath, runtimeDir string) error {
	if !fileExists(filepath.Join(projectPath, "package.json")) || fileExists(filepath.Join(projectPath, "node_modules")) {
		return nil
	}

	pm := config.DetectPackageManager(projectPath)
	m.emitOutput(projectID, fmt.Sprintf("\nMissing `node_modules`. Installing dependencies with `%s`...\nCommand: %s install\n\n", pm, pm))

	cmd := createShellCommand(pm + " install")
	cmd.Dir = projectPath
	// 依赖安装使用同一个运行时，否则 esbuild 之类的原生模块会按错误的 ABI 编译
	m.applyEnvironment(cmd, projectID, nil, runtimeDir)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to start dependency install: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to start dependency install: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start dependency install: %w", err)
	}

	var (
		bufMu          sync.Mutex
		buffer         string
		flushScheduled atomic.Bool
	)
	readInstall := func(r io.Reader) {
		b := make([]byte, 4096)
		for {
			n, err := r.Read(b)
			if n > 0 {
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
	go readInstall(stdout)
	go readInstall(stderr)

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case err := <-done:
		m.flushBufferNow(projectID, &bufMu, &buffer)
		if err != nil {
			return fmt.Errorf("dependency install exited with error: %w", err)
		}
		m.emitOutput(projectID, "\nDependencies installed. Starting development server...\n\n")
		return nil
	case <-time.After(time.Duration(dependencyInstallTimeoutMS) * time.Millisecond):
		_ = cmd.Process.Kill()
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

func (m *Manager) spawnOutputReader(projectID string, r io.Reader, mp *managedProcess) {
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

	running := true
	if mp.cmd != nil && mp.cmd.ProcessState != nil && mp.cmd.ProcessState.Exited() {
		running = false
	}

	next := types.ServerStatusRunning
	if !running {
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

func (m *Manager) spawnExitMonitor(projectID string, mp *managedProcess) {
	waitErr := mp.cmd.Wait()
	m.flushOutputNow(projectID, mp)

	exitCode := -1
	if mp.cmd.ProcessState != nil {
		exitCode = mp.cmd.ProcessState.ExitCode()
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
