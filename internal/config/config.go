package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"
)

const (
	// maxPathLength 路径最大长度，防止异常超长输入
	maxPathLength = 4096
	// maxCommandLength 命令/环境变量值最大长度
	maxCommandLength = 1000
)

var (
	// envKeyPattern 环境变量名合法格式
	envKeyPattern = regexp.MustCompile(`^[A-Z_][A-Z0-9_]*$`)
	// commandSubstitution 清理 $(...) 命令替换
	commandSubstitution = regexp.MustCompile(`\$\([^)]*\)`)
	// variableSubstitution 清理 ${...}
	variableSubstitution = regexp.MustCompile(`\$\{[^}]*\}`)
	// backticks 清理反引号命令
	backticks = regexp.MustCompile("`[^`]*`")
)

// LoadProjectConfig 从项目目录加载 dev-config.json 或根据 package.json 自动生成配置
func LoadProjectConfig(projectPath string) (types.DevConfig, error) {
	path, err := SanitizePath(projectPath)
	if err != nil {
		return types.DevConfig{}, err
	}
	if err := validateExistingDirectory(path); err != nil {
		return types.DevConfig{}, err
	}

	devConfigPath := filepath.Join(path, "dev-config.json")
	if fileExists(devConfigPath) {
		content, err := os.ReadFile(devConfigPath)
		if err != nil {
			return types.DevConfig{}, fmt.Errorf("无法读取 dev-config.json: %w", err)
		}
		var config types.DevConfig
		if err := json.Unmarshal(content, &config); err != nil {
			return types.DevConfig{}, fmt.Errorf("dev-config.json 不是有效的 JSON: %w", err)
		}
		if err := ValidateDevConfigOrError(config); err != nil {
			return types.DevConfig{}, err
		}
		return config, nil
	}

	packageJSONPath := filepath.Join(path, "package.json")
	if fileExists(packageJSONPath) {
		return buildAutoConfig(path)
	}

	return types.DevConfig{}, fmt.Errorf("未找到 dev-config.json 或 package.json 文件")
}

// SanitizePath 规范化并校验路径：禁止 ..，相对路径基于当前工作目录
func SanitizePath(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", fmt.Errorf("路径不能为空")
	}
	if utf8.RuneCountInString(trimmed) > maxPathLength || len(trimmed) > maxPathLength {
		return "", fmt.Errorf("路径长度超出限制")
	}

	// 禁止上级目录引用（与 Rust 侧一致）
	parts := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == '/' || r == '\\'
	})
	for _, part := range parts {
		if part == ".." {
			return "", fmt.Errorf("路径包含非法的上级目录引用")
		}
	}

	if filepath.IsAbs(trimmed) {
		return filepath.Clean(trimmed), nil
	}

	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("无法解析当前目录: %w", err)
	}
	return filepath.Clean(filepath.Join(cwd, trimmed)), nil
}

// ValidateProjectDirectory 校验项目目录存在且含 package.json 或 dev-config.json
func ValidateProjectDirectory(path string) error {
	if err := validateExistingDirectory(path); err != nil {
		return err
	}
	if fileExists(filepath.Join(path, "package.json")) || fileExists(filepath.Join(path, "dev-config.json")) {
		return nil
	}
	return fmt.Errorf("目录中未找到 dev-config.json 或 package.json 文件")
}

// DetectPackageManager 根据锁文件探测包管理器
func DetectPackageManager(projectPath string) string {
	if fileExists(filepath.Join(projectPath, "pnpm-lock.yaml")) {
		return "pnpm"
	}
	if fileExists(filepath.Join(projectPath, "yarn.lock")) {
		return "yarn"
	}
	return "npm"
}

// ValidateDevConfig 校验 DevConfig 字段合法性
func ValidateDevConfig(config types.DevConfig) types.ValidationResult {
	var errors []types.ValidationError

	if strings.TrimSpace(config.Command) == "" {
		errors = append(errors, types.ValidationError{Field: "command", Message: "命令不能为空"})
	} else {
		if len(config.Command) > maxCommandLength {
			errors = append(errors, types.ValidationError{Field: "command", Message: "命令长度超出限制"})
		}
		lowered := strings.ToLower(config.Command)
		dangerous := []string{"rm -rf /", "format c:", "shutdown -s", "taskkill /im explorer.exe"}
		for _, pattern := range dangerous {
			if strings.Contains(lowered, pattern) {
				errors = append(errors, types.ValidationError{Field: "command", Message: "命令包含潜在危险操作"})
				break
			}
		}
	}

	if strings.TrimSpace(config.Cwd) == "" {
		errors = append(errors, types.ValidationError{Field: "cwd", Message: "工作目录不能为空"})
	}

	if config.Port != nil && *config.Port == 0 {
		errors = append(errors, types.ValidationError{Field: "port", Message: "端口号必须在 1-65535 之间"})
	}

	if config.Name != nil && strings.TrimSpace(*config.Name) == "" {
		errors = append(errors, types.ValidationError{Field: "name", Message: "项目名称不能为空字符串"})
	}

	if config.Env != nil {
		for key, value := range config.Env {
			if !envKeyPattern.MatchString(key) {
				errors = append(errors, types.ValidationError{
					Field:   "env",
					Message: fmt.Sprintf("环境变量名格式无效: %s", key),
				})
			}
			if len(value) > maxCommandLength {
				errors = append(errors, types.ValidationError{
					Field:   "env",
					Message: fmt.Sprintf("环境变量值过长: %s", key),
				})
			}
		}
	}

	return types.ValidationResult{Valid: len(errors) == 0, Errors: errors}
}

// ValidateDevConfigOrError 校验失败时合并错误消息返回 error
func ValidateDevConfigOrError(config types.DevConfig) error {
	result := ValidateDevConfig(config)
	if result.Valid {
		return nil
	}
	msgs := make([]string, 0, len(result.Errors))
	for _, e := range result.Errors {
		msgs = append(msgs, e.Message)
	}
	return fmt.Errorf("%s", strings.Join(msgs, ", "))
}

// SanitizeCommand 清理命令中的命令替换/变量替换/反引号
func SanitizeCommand(command string) (string, error) {
	trimmed := strings.TrimSpace(command)
	if trimmed == "" {
		return "", fmt.Errorf("命令不能为空")
	}
	sanitized := commandSubstitution.ReplaceAllString(trimmed, "")
	sanitized = variableSubstitution.ReplaceAllString(sanitized, "")
	sanitized = backticks.ReplaceAllString(sanitized, "")
	sanitized = strings.TrimSpace(sanitized)
	if sanitized == "" {
		return "", fmt.Errorf("命令清理后为空")
	}
	return sanitized, nil
}

// buildAutoConfig 根据 package.json scripts 自动推断启动命令
func buildAutoConfig(projectPath string) (types.DevConfig, error) {
	content, err := os.ReadFile(filepath.Join(projectPath, "package.json"))
	if err != nil {
		return types.DevConfig{}, fmt.Errorf("无法读取 package.json: %w", err)
	}

	var packageJSON map[string]any
	if err := json.Unmarshal(content, &packageJSON); err != nil {
		return types.DevConfig{}, fmt.Errorf("package.json 不是有效的 JSON: %w", err)
	}

	startScript := "start"
	if scripts, ok := packageJSON["scripts"].(map[string]any); ok {
		if _, has := scripts["dev"]; has {
			startScript = "dev"
		} else if _, has := scripts["start"]; has {
			startScript = "start"
		} else if _, has := scripts["serve"]; has {
			startScript = "serve"
		}
	}

	var projectName *string
	if name, ok := packageJSON["name"].(string); ok && name != "" {
		projectName = &name
	} else {
		base := filepath.Base(projectPath)
		projectName = &base
	}

	pm := DetectPackageManager(projectPath)
	return types.DevConfig{
		Name:    projectName,
		Command: fmt.Sprintf("%s run %s", pm, startScript),
		Cwd:     projectPath,
	}, nil
}

func validateExistingDirectory(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("项目路径不存在")
		}
		return fmt.Errorf("无法访问项目路径: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("项目路径不是有效目录")
	}
	return nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
