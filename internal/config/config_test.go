package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"
)

func TestValidateDevConfigEmptyCommand(t *testing.T) {
	result := ValidateDevConfig(types.DevConfig{Command: "", Cwd: `C:\tmp`})
	if result.Valid {
		t.Fatal("expected invalid")
	}
}

func TestSanitizePathRejectsParent(t *testing.T) {
	if _, err := SanitizePath(`C:\foo\..\bar`); err == nil {
		t.Fatal("expected error for parent dir")
	}
}

func TestSanitizeCommandStripsSubstitution(t *testing.T) {
	out, err := SanitizeCommand("npm run dev $(whoami)")
	if err != nil {
		t.Fatal(err)
	}
	if out != "npm run dev" {
		t.Fatalf("got %q", out)
	}
}

func TestDetectPackageManager(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "pnpm-lock.yaml"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := DetectPackageManager(dir); got != "pnpm" {
		t.Fatalf("got %s", got)
	}
}

func TestLoadProjectConfigFromPackageJSON(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"name":"demo","scripts":{"dev":"vite"}}`
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadProjectConfig(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Command != "npm run dev" {
		t.Fatalf("command=%q", cfg.Command)
	}
	if cfg.Name == nil || *cfg.Name != "demo" {
		t.Fatalf("name=%v", cfg.Name)
	}
}
