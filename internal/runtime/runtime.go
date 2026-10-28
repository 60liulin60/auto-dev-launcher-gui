// Package runtime 负责发现本机安装的 Node 运行时，并决定某个项目该使用哪一个。
//
// 设计约束见 docs/adr/0001-per-process-path-injection.md：程序从不为项目执行
// `nvm use`，只解析出具体的版本目录，由调用方把该目录注入子进程的 PATH。
package runtime

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// Source 运行时来源
type Source string

const (
	// SourceNVM 由 nvm-windows 安装的版本
	SourceNVM Source = "nvm"
	// SourceSystem PATH 上碰巧排第一的 Node，程序不注入任何目录
	SourceSystem Source = "system"
)

// Runtime 一个具体安装好的 Node 版本
type Runtime struct {
	Version string `json:"version"`
	Dir     string `json:"dir"`
	Source  Source `json:"source"`
}

// IsSystem 是否为系统默认运行时（不注入 PATH）
func (r Runtime) IsSystem() bool { return r.Source == SourceSystem }

// Display 界面展示用的名字
func (r Runtime) Display() string {
	if r.IsSystem() {
		return "系统默认"
	}
	return r.Version
}

// Spec 项目目录里写下的原始版本声明
type Spec struct {
	Raw    string `json:"raw"`
	Source string `json:"source"`
}

// ErrRuntimeNotFound 指定的版本本机没装
type ErrRuntimeNotFound struct {
	Requested string
	Source    string
	Available []string
}

func (e *ErrRuntimeNotFound) Error() string {
	available := strings.Join(e.Available, " / ")
	if available == "" {
		available = "无"
	}
	if e.Source == "" {
		return fmt.Sprintf("运行时 %s 未安装（已安装：%s）", e.Requested, available)
	}
	return fmt.Sprintf("运行时 %s 未安装（来自 %s，已安装：%s）", e.Requested, e.Source, available)
}

// ErrInvalidSpec 版本声明无法定位到具体版本（不是错误，按未指定处理）
var ErrInvalidSpec = errors.New("无法解析的版本声明")

// System 返回 PATH 上的 node（不注入任何目录时子进程直接用）
func System() Runtime {
	path, err := exec.LookPath("node")
	if err != nil {
		return Runtime{Source: SourceSystem}
	}
	return Runtime{Version: "", Dir: filepath.Dir(path), Source: SourceSystem}
}

// Discover 扫描 nvm-windows 安装的运行时。
// nvmHome 为 NVM_HOME 指向的目录（内含 settings.txt），settings.txt 的 root
// 才是真正的版本目录（本机就是 D:\nvm 与 D:\Users\...\Roaming\nvm 分离的情况）。
func Discover(nvmHome string) ([]Runtime, error) {
	if strings.TrimSpace(nvmHome) == "" {
		return nil, nil
	}

	root := nvmRoot(nvmHome)
	list, err := listVersionDirs(root)
	if err != nil {
		return nil, err
	}
	return list, nil
}

// nvmRoot 读取 settings.txt 的 root:；缺失时退回 nvmHome 本身
func nvmRoot(nvmHome string) string {
	content, err := os.ReadFile(filepath.Join(nvmHome, "settings.txt"))
	if err != nil {
		return nvmHome
	}
	if root := parseSettingsRoot(string(content)); root != "" {
		return root
	}
	return nvmHome
}

// parseSettingsRoot 从 nvm settings.txt 内容里提取 root 配置
func parseSettingsRoot(content string) string {
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		key, value, ok := strings.Cut(trimmed, ":")
		if !ok {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(key), "root") {
			continue
		}
		return strings.TrimSpace(value)
	}
	return ""
}

// listVersionDirs 列出 root 下的 v<major>.<minor>.<patch> 目录
func listVersionDirs(root string) ([]Runtime, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("无法读取 nvm 版本目录 %s: %w", root, err)
	}

	list := make([]Runtime, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		version, ok := ParseVersionDirName(entry.Name())
		if !ok {
			continue
		}
		list = append(list, Runtime{
			Version: version,
			Dir:     filepath.Join(root, entry.Name()),
			Source:  SourceNVM,
		})
	}

	sort.Slice(list, func(i, j int) bool {
		return compareVersions(list[i].Version, list[j].Version) > 0
	})
	return list, nil
}

// ParseVersionDirName 把 "v18.20.4" 解析成 "18.20.4"；非版本目录返回 false
func ParseVersionDirName(name string) (string, bool) {
	trimmed := strings.TrimPrefix(strings.TrimPrefix(name, "v"), "V")
	parts := strings.Split(trimmed, ".")
	if len(parts) != 3 {
		return "", false
	}
	for _, part := range parts {
		if part == "" {
			return "", false
		}
		if _, err := strconv.Atoi(part); err != nil {
			return "", false
		}
	}
	return trimmed, true
}

// ReadSpec 按 .nvmrc → .node-version → package.json engines.node 读版本声明。
// 三个文件都没有时返回 false。
func ReadSpec(projectPath string) (Spec, bool) {
	for _, name := range []string{".nvmrc", ".node-version"} {
		content, err := os.ReadFile(filepath.Join(projectPath, name))
		if err != nil {
			continue
		}
		if raw := strings.TrimSpace(string(content)); raw != "" {
			return Spec{Raw: raw, Source: name}, true
		}
	}

	content, err := os.ReadFile(filepath.Join(projectPath, "package.json"))
	if err != nil {
		return Spec{}, false
	}
	var pkg struct {
		Engines struct {
			Node string `json:"node"`
		} `json:"engines"`
	}
	if err := json.Unmarshal(content, &pkg); err != nil {
		return Spec{}, false
	}
	if raw := strings.TrimSpace(pkg.Engines.Node); raw != "" {
		return Spec{Raw: raw, Source: "package.json engines.node"}, true
	}
	return Spec{}, false
}

// NormalizeSpec 把版本声明归一化成 "18" / "18.20" / "18.20.4" 这种前缀形式。
// `lts/*`、`node`、`>=18` 这类无法定位到具体版本的写法返回 ErrInvalidSpec。
// `^18.20.0` / `~18.20.0` 按语义降级为可匹配的前缀（^ → 18，~ → 18.20）。
func NormalizeSpec(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ErrInvalidSpec
	}
	loose := ""
	switch {
	case strings.HasPrefix(trimmed, "^"):
		loose, trimmed = "major", strings.TrimPrefix(trimmed, "^")
	case strings.HasPrefix(trimmed, "~"):
		loose, trimmed = "minor", strings.TrimPrefix(trimmed, "~")
	default:
		// 其余范围符号无法定位到具体版本
		for _, prefix := range []string{">=", "<=", ">", "<", "="} {
			if strings.HasPrefix(trimmed, prefix) {
				return "", ErrInvalidSpec
			}
		}
	}
	trimmed = strings.TrimPrefix(strings.TrimPrefix(trimmed, "v"), "V")

	parts := strings.Split(trimmed, ".")
	if len(parts) > 3 {
		return "", ErrInvalidSpec
	}

	normalized := make([]string, 0, len(parts))
	wildcard := false
	for _, part := range parts {
		lowered := strings.ToLower(part)
		if lowered == "x" || lowered == "*" {
			wildcard = true
			continue
		}
		if part == "" || wildcard {
			// 通配符之后又出现具体数字（如 18.x.4）属于畸形写法
			return "", ErrInvalidSpec
		}
		if _, err := strconv.Atoi(part); err != nil {
			return "", ErrInvalidSpec
		}
		normalized = append(normalized, part)
	}
	if len(normalized) == 0 {
		return "", ErrInvalidSpec
	}
	switch loose {
	case "major":
		return normalized[0], nil
	case "minor":
		if len(normalized) >= 2 {
			return normalized[0] + "." + normalized[1], nil
		}
		return normalized[0], nil
	}
	return strings.Join(normalized, "."), nil
}

// Match 在已安装列表里找匹配前缀的最高版本
func Match(prefix string, available []Runtime) (Runtime, bool) {
	wanted := strings.Split(prefix, ".")
	var best Runtime
	found := false
	for _, candidate := range available {
		if !matchPrefix(wanted, candidate.Version) {
			continue
		}
		if !found || compareVersions(candidate.Version, best.Version) > 0 {
			best = candidate
			found = true
		}
	}
	return best, found
}

func matchPrefix(wanted []string, version string) bool {
	parts := strings.Split(version, ".")
	if len(parts) < len(wanted) {
		return false
	}
	for i, want := range wanted {
		if parts[i] != want {
			return false
		}
	}
	return true
}

// compareVersions 比较两个版本号，返回 >0 表示 a 更高
func compareVersions(a, b string) int {
	aparts := strings.Split(a, ".")
	bparts := strings.Split(b, ".")
	for i := 0; i < len(aparts) || i < len(bparts); i++ {
		av, bv := 0, 0
		if i < len(aparts) {
			av, _ = strconv.Atoi(aparts[i])
		}
		if i < len(bparts) {
			bv, _ = strconv.Atoi(bparts[i])
		}
		if av != bv {
			if av > bv {
				return 1
			}
			return -1
		}
	}
	return 0
}

// Origin 有效运行时的来源
type Origin string

const (
	OriginConfig  Origin = "config"
	OriginHistory Origin = "history"
	OriginSpec    Origin = "spec"
	OriginSystem  Origin = "system"
)

// Request 选择有效运行时的输入
type Request struct {
	// Available 已安装的运行时（Discover 的结果）
	Available []Runtime
	// ConfigVersion dev-config.json 里的 runtime 字段
	ConfigVersion string
	// HistoryVersion 本机历史记录里的覆盖值
	HistoryVersion string
	// Spec 项目目录里的版本声明
	Spec Spec
	// HasSpec 是否存在版本声明
	HasSpec bool
	// System 系统默认运行时，零值表示 PATH 上找不到 node
	System Runtime
}

// Resolution 选择结果
type Resolution struct {
	Runtime Runtime
	Origin  Origin
	// Note 需要提示给用户、但不阻塞启动的说明（例如版本声明无法解析）
	Note string
}

// Resolve 按优先级选出有效运行时：
// dev-config 的显式值 → 本机历史覆盖 → 版本声明 → 系统默认。
// 显式指定（前三条）的版本没装时返回 ErrRuntimeNotFound，绝不静默回退。
func (req Request) Resolve() (Resolution, error) {
	available := make([]string, 0, len(req.Available))
	for _, item := range req.Available {
		available = append(available, item.Version)
	}

	if version := strings.TrimSpace(req.ConfigVersion); version != "" {
		prefix, err := NormalizeSpec(version)
		if err != nil {
			return Resolution{}, fmt.Errorf("dev-config.json 中的 runtime %q 无法解析为具体版本", version)
		}
		matched, ok := Match(prefix, req.Available)
		if !ok {
			return Resolution{}, &ErrRuntimeNotFound{Requested: version, Source: "dev-config.json", Available: available}
		}
		return Resolution{Runtime: matched, Origin: OriginConfig}, nil
	}

	if version := strings.TrimSpace(req.HistoryVersion); version != "" {
		prefix, err := NormalizeSpec(version)
		if err != nil {
			return Resolution{}, fmt.Errorf("本机记录的 runtime %q 无法解析为具体版本", version)
		}
		matched, ok := Match(prefix, req.Available)
		if !ok {
			return Resolution{}, &ErrRuntimeNotFound{Requested: version, Source: "本机记录", Available: available}
		}
		return Resolution{Runtime: matched, Origin: OriginHistory}, nil
	}

	if req.HasSpec {
		prefix, err := NormalizeSpec(req.Spec.Raw)
		if err != nil {
			return Resolution{
				Runtime: req.System,
				Origin:  OriginSystem,
				Note:    fmt.Sprintf("%s 中的 %q 无法解析为具体版本，已使用系统默认 Node", req.Spec.Source, req.Spec.Raw),
			}, nil
		}
		matched, ok := Match(prefix, req.Available)
		if !ok {
			return Resolution{}, &ErrRuntimeNotFound{Requested: req.Spec.Raw, Source: req.Spec.Source, Available: available}
		}
		return Resolution{Runtime: matched, Origin: OriginSpec}, nil
	}

	return Resolution{Runtime: req.System, Origin: OriginSystem}, nil
}
