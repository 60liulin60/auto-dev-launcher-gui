package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/types"
)

func TestHistoryRoundTrip(t *testing.T) {
	mgr, err := NewWithPath(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	history := []types.ProjectHistoryEntry{{
		ID:           "p1",
		Name:         "demo",
		Path:         `E:\demo`,
		LastLaunched: 123,
		Config:       types.DevConfig{Command: "npm run dev", Cwd: `E:\demo`},
	}}
	if err := mgr.SaveProjectHistory(history); err != nil {
		t.Fatal(err)
	}
	loaded, err := mgr.LoadProjectHistory()
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded) != 1 || loaded[0].ID != "p1" {
		t.Fatalf("unexpected: %+v", loaded)
	}
	if _, err := os.Stat(filepath.Join(mgr.StoragePath(), "project-history.json")); err != nil {
		t.Fatal(err)
	}
}

func TestSettingsDefaultAndSave(t *testing.T) {
	mgr, err := NewWithPath(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s, err := mgr.LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	if s.MaxHistoryEntries != 50 {
		t.Fatalf("default max=%d", s.MaxHistoryEntries)
	}
	s.Theme = "dark"
	if err := mgr.SaveSettings(s); err != nil {
		t.Fatal(err)
	}
	again, err := mgr.LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	if again.Theme != "dark" {
		t.Fatalf("theme=%s", again.Theme)
	}
}

func TestBackupFallback(t *testing.T) {
	dir := t.TempDir()
	mgr, err := NewWithPath(dir)
	if err != nil {
		t.Fatal(err)
	}
	history := []types.ProjectHistoryEntry{{
		ID: "p2", Name: "x", Path: `E:\x`, LastLaunched: 1,
		Config: types.DevConfig{Command: "npm run dev", Cwd: `E:\x`},
	}}
	if err := mgr.SaveProjectHistory(history); err != nil {
		t.Fatal(err)
	}
	// 损坏主文件，保留 bak
	main := filepath.Join(dir, "project-history.json")
	bak := main + ".bak"
	_ = os.WriteFile(bak, []byte(`[{"id":"p2","name":"x","path":"E:\\x","lastLaunched":1,"config":{"command":"npm run dev","cwd":"E:\\x"}}]`), 0o644)
	_ = os.WriteFile(main, []byte("{broken"), 0o644)

	loaded, err := mgr.LoadProjectHistory()
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded) != 1 || loaded[0].ID != "p2" {
		t.Fatalf("fallback failed: %+v", loaded)
	}
	if data, err := os.ReadFile(bak); err != nil {
		t.Fatalf("恢复后 .bak 应仍存在: %v", err)
	} else if !json.Valid(data) {
		t.Fatal("恢复后 .bak 不应被损坏的主文件覆盖")
	}
}

func TestConcurrentHistoryUpdates(t *testing.T) {
	mgr, err := NewWithPath(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	const count = 20
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			err := mgr.UpdateProjectHistory(func(history []types.ProjectHistoryEntry) ([]types.ProjectHistoryEntry, error) {
				return append(history, types.ProjectHistoryEntry{
					ID:           fmt.Sprintf("p%d", i),
					Name:         fmt.Sprintf("project-%d", i),
					Path:         fmt.Sprintf(`E:\p%d`, i),
					LastLaunched: uint64(i),
					Config:       types.DevConfig{Command: "npm run dev", Cwd: fmt.Sprintf(`E:\p%d`, i)},
				}), nil
			})
			if err != nil {
				t.Errorf("update %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()

	loaded, err := mgr.LoadProjectHistory()
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded) != count {
		t.Fatalf("并发更新应保留 %d 条，实际 %d", count, len(loaded))
	}
}
