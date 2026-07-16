package process

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/config"
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

// managedProcess 单个项目的进程运行态
type managedProcess struct {
	pid            uint32
	cmd            *exec.Cmd
	infoMu         sync.Mutex
	info           types.ServerProcess
	outputMu       sync.Mutex
	outputBuffer   string
	flushScheduled atomic.Bool
	urlDetected    atomic.Bool
	// killOnce 保证只杀一次
	killOnce sync.Once
}

// Manager 多项目进程管理器
type Manager struct {
	mu        sync.Mutex
	processes map[string]*managedProcess
	emitter   Emitter
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

// StartServer 启动项目开发服务器（必要时先装依赖）
func (m *Manager) StartServer(projectID, projectPath string, cfg types.DevConfig) (types.ServerProcess, error) {
	path, err := config.SanitizePath(projectPath)
	if err != nil {
		return types.ServerProcess{}, err
	}
	if err := config.ValidateProjectDirectory(path); err != nil {
		return types.ServerProcess{}, err
	}
	if err := config.ValidateDevConfigOrError(cfg); err != nil {
		return types.ServerProcess{}, err
	}

	workDir, err := config.SanitizePath(cfg.Cwd)
	if err != nil {
		return types.ServerProcess{}, err
	}
	if err := config.ValidateProjectDirectory(workDir); err != nil {
		return types.ServerProcess{}, err
	}

	m.mu.Lock()
	if existing, ok := m.processes[projectID]; ok {
		existing.infoMu.Lock()
		st := existing.info.Status
		existing.infoMu.Unlock()
		if st == types.ServerStatusStarting || st == types.ServerStatusRunning {
			m.mu.Unlock()
			return types.ServerProcess{}, fmt.Errorf("project is already running")
		}
	}
	m.mu.Unlock()

	if err := m.installDependenciesIfNeeded(projectID, path); err != nil {
		return types.ServerProcess{}, err
	}

	sanitized, err := config.SanitizeCommand(cfg.Command)
	if err != nil {
		return types.ServerProcess{}, err
	}

	cmd := createShellCommand(sanitized)
	cmd.Dir = workDir
	cmd.Stdout = nil
	cmd.Stderr = nil

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return types.ServerProcess{}, fmt.Errorf("failed to start server process: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return types.ServerProcess{}, fmt.Errorf("failed to start server process: %w", err)
	}

	m.applySafeEnvironment(projectID, cfg, cmd)

	if err := cmd.Start(); err != nil {
		return types.ServerProcess{}, fmt.Errorf("failed to start server process: %w", err)
	}

	pid := uint32(cmd.Process.Pid)
	mp := &managedProcess{
		pid: pid,
		cmd: cmd,
		info: types.ServerProcess{
			ProjectID: projectID,
			PID:       pid,
			Status:    types.ServerStatusStarting,
			StartTime: currentTimestampMS(),
		},
	}

	m.mu.Lock()
	m.processes[projectID] = mp
	m.mu.Unlock()

	go m.spawnOutputReader(projectID, stdout, mp)
	go m.spawnOutputReader(projectID, stderr, mp)
	go m.spawnStartupGuard(projectID, mp)
	go m.spawnExitMonitor(projectID, mp)

	mp.infoMu.Lock()
	info := mp.info
	mp.infoMu.Unlock()
	return info, nil
}

// StopServer 停止指定项目进程（Windows 使用 taskkill /T /F）
func (m *Manager) StopServer(projectID string) error {
	m.mu.Lock()
	mp, ok := m.processes[projectID]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("project is not running")
	}
	return m.killManaged(mp)
}

// GetServerStatus 查询项目状态；未知项目返回 idle
func (m *Manager) GetServerStatus(projectID string) types.ServerStatus {
	m.mu.Lock()
	mp, ok := m.processes[projectID]
	m.mu.Unlock()
	if !ok {
		return types.ServerStatusIdle
	}
	mp.infoMu.Lock()
	defer mp.infoMu.Unlock()
	return mp.info.Status
}

// StopAllServers 停止全部项目并等待退出
func (m *Manager) StopAllServers() error {
	m.mu.Lock()
	ids := make([]string, 0, len(m.processes))
	for id := range m.processes {
		ids = append(ids, id)
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
		m.mu.Lock()
		n := len(m.processes)
		m.mu.Unlock()
		if n == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("still waiting for %d process(es) to stop", n)
		}
		time.Sleep(time.Duration(stopWaitIntervalMS) * time.Millisecond)
	}
}

func (m *Manager) installDependenciesIfNeeded(projectID, projectPath string) error {
	if !fileExists(filepath.Join(projectPath, "package.json")) || fileExists(filepath.Join(projectPath, "node_modules")) {
		return nil
	}

	pm := config.DetectPackageManager(projectPath)
	m.emitOutput(projectID, fmt.Sprintf("\nMissing `node_modules`. Installing dependencies with `%s`...\nCommand: %s install\n\n", pm, pm))

	cmd := createShellCommand(pm + " install")
	cmd.Dir = projectPath
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
			if err != io.EOF {
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

	running := mp.cmd.ProcessState == nil
	// ProcessState 在 Wait 前为 nil 表示可能仍在运行；再探测一次
	if mp.cmd.Process != nil {
		// 通过 signal 0 探测（Windows 上 Process.Signal 可能不支持，回退 ProcessState）
		running = true
		if mp.cmd.ProcessState != nil && mp.cmd.ProcessState.Exited() {
			running = false
		}
	}

	next := types.ServerStatusRunning
	if !running {
		next = types.ServerStatusError
	}

	mp.infoMu.Lock()
	if mp.info.Status == types.ServerStatusStarting {
		mp.info.Status = next
	} else {
		mp.infoMu.Unlock()
		return
	}
	mp.infoMu.Unlock()

	m.emit(types.EventServerStatusChange, types.StatusChangePayload{ProjectID: projectID, Status: next})
	if next == types.ServerStatusError {
		m.mu.Lock()
		delete(m.processes, projectID)
		m.mu.Unlock()
	}
}

func (m *Manager) spawnExitMonitor(projectID string, mp *managedProcess) {
	err := mp.cmd.Wait()
	_ = err

	m.flushOutputNow(projectID, mp)

	mp.infoMu.Lock()
	mp.info.Status = types.ServerStatusStopped
	mp.infoMu.Unlock()

	m.emit(types.EventServerStatusChange, types.StatusChangePayload{
		ProjectID: projectID,
		Status:    types.ServerStatusStopped,
	})

	m.mu.Lock()
	delete(m.processes, projectID)
	m.mu.Unlock()
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

func (m *Manager) applySafeEnvironment(projectID string, cfg types.DevConfig, cmd *exec.Cmd) {
	if cfg.Env == nil {
		return
	}
	// 一旦设置 Env，会完全覆盖继承环境，因此先复制系统环境
	env := append([]string{}, os.Environ()...)
	for key, value := range cfg.Env {
		if _, protected := envProtectedKeys[key]; protected {
			m.emitOutput(projectID, fmt.Sprintf("[system] skipped protected environment variable \"%s\"\n", key))
			continue
		}
		env = append(env, key+"="+value)
	}
	cmd.Env = env
}

// ExtractLocalURL 导出 URL 提取逻辑供单测
func ExtractLocalURL(output string) (string, bool) {
	matches := localURLRegex.FindStringSubmatch(output)
	if len(matches) < 2 {
		return "", false
	}
	return "http://localhost:" + matches[1], true
}

func createShellCommand(raw string) *exec.Cmd {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", raw)
	} else {
		cmd = exec.Command("sh", "-c", raw)
	}
	hideWindow(cmd)
	return cmd
}


func currentTimestampMS() uint64 {
	return uint64(time.Now().UnixMilli())
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
