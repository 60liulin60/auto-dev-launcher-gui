package runtime

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestParseVersionDirName(t *testing.T) {
	cases := []struct {
		name string
		want string
		ok   bool
	}{
		{"v18.20.4", "18.20.4", true},
		{"V24.19.0", "24.19.0", true},
		{"18.20.4", "18.20.4", true},
		{"nodejs", "", false},
		{"v18.20", "", false},
		{"v18.20.4.1", "", false},
		{"vabc.1.2", "", false},
		{"v14.17.6", "14.17.6", true},
	}

	for _, tc := range cases {
		got, ok := ParseVersionDirName(tc.name)
		if ok != tc.ok || got != tc.want {
			t.Errorf("ParseVersionDirName(%q) = (%q, %v)，期望 (%q, %v)", tc.name, got, ok, tc.want, tc.ok)
		}
	}
}

func TestParseSettingsRoot(t *testing.T) {
	content := "root: D:\\Users\\Administrator\\AppData\\Roaming\\nvm\r\npath: D:\\nvm\\nodejs\r\nnode_mirror: https://npmmirror.com/mirrors/node/\r\n"
	if got := parseSettingsRoot(content); got != `D:\Users\Administrator\AppData\Roaming\nvm` {
		t.Errorf("parseSettingsRoot 解析出 %q", got)
	}
	if got := parseSettingsRoot("node_mirror: x\n"); got != "" {
		t.Errorf("没有 root 时应当返回空，得到 %q", got)
	}
}

func TestDiscoverUsesSettingsRoot(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "versions")
	nvmHome := filepath.Join(base, "nvmhome")

	for _, dir := range []string{"v18.20.4", "v20.11.1", "v9.11.2", "nodejs"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
			t.Fatalf("准备目录失败: %v", err)
		}
	}
	if err := os.MkdirAll(nvmHome, 0o755); err != nil {
		t.Fatalf("准备 nvm home 失败: %v", err)
	}
	settings := "root: " + root + "\npath: " + filepath.Join(nvmHome, "nodejs") + "\n"
	if err := os.WriteFile(filepath.Join(nvmHome, "settings.txt"), []byte(settings), 0o644); err != nil {
		t.Fatalf("写 settings.txt 失败: %v", err)
	}

	list, err := Discover(nvmHome)
	if err != nil {
		t.Fatalf("Discover 返回错误: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("应发现 3 个运行时，实际 %d 个: %+v", len(list), list)
	}
	// 按版本倒序
	if list[0].Version != "20.11.1" || list[1].Version != "18.20.4" || list[2].Version != "9.11.2" {
		t.Errorf("版本排序不正确: %+v", list)
	}
	if list[0].Source != SourceNVM {
		t.Errorf("来源应为 nvm，得到 %q", list[0].Source)
	}
	if list[0].Dir != filepath.Join(root, "v20.11.1") {
		t.Errorf("目录不正确: %q", list[0].Dir)
	}
}

func TestDiscoverWithoutNvmHome(t *testing.T) {
	list, err := Discover("")
	if err != nil || list != nil {
		t.Fatalf("空 nvmHome 应返回 (nil, nil)，得到 (%+v, %v)", list, err)
	}
	list, err = Discover(filepath.Join(t.TempDir(), "not-exist"))
	if err != nil || list != nil {
		t.Fatalf("不存在的 nvmHome 应返回 (nil, nil)，得到 (%+v, %v)", list, err)
	}
}

func TestNormalizeSpec(t *testing.T) {
	valid := map[string]string{
		"18":         "18",
		"v18.20.4":   "18.20.4",
		"18.x":       "18",
		"20.11":      "20.11",
		"  22.3.0  ": "22.3.0",
		// engines.node 常见写法：^ 放宽到主版本，~ 放宽到次版本
		"^18.20.0": "18",
		"~18.20.0": "18.20",
		"~16":      "16",
	}
	for raw, want := range valid {
		got, err := NormalizeSpec(raw)
		if err != nil || got != want {
			t.Errorf("NormalizeSpec(%q) = (%q, %v)，期望 %q", raw, got, err, want)
		}
	}

	invalid := []string{"lts/*", "node", ">=18", "<20", "*", "", "x", "18.x.4"}
	for _, raw := range invalid {
		if _, err := NormalizeSpec(raw); !errors.Is(err, ErrInvalidSpec) {
			t.Errorf("NormalizeSpec(%q) 应返回 ErrInvalidSpec，实际 %v", raw, err)
		}
	}
}

func TestMatchPicksHighest(t *testing.T) {
	available := []Runtime{
		{Version: "18.19.0", Dir: "a"},
		{Version: "18.20.4", Dir: "b"},
		{Version: "20.11.1", Dir: "c"},
		{Version: "20.11.10", Dir: "d"},
	}

	got, ok := Match("18", available)
	if !ok || got.Version != "18.20.4" {
		t.Errorf("匹配 18 应得到 18.20.4，实得 %+v", got)
	}
	got, ok = Match("20.11", available)
	if !ok || got.Version != "20.11.10" {
		t.Errorf("匹配 20.11 应得到 20.11.10，实得 %+v", got)
	}
	got, ok = Match("20.11.1", available)
	if !ok || got.Version != "20.11.1" {
		t.Errorf("精确匹配 20.11.1 失败，实得 %+v", got)
	}
	if _, ok := Match("16", available); ok {
		t.Error("16 不应匹配到任何版本")
	}
}

func TestReadSpecPrecedence(t *testing.T) {
	dir := t.TempDir()

	if _, ok := ReadSpec(dir); ok {
		t.Error("空目录不应有版本声明")
	}

	pkg := `{"name":"demo","engines":{"node":"20.11.1"}}`
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0o644); err != nil {
		t.Fatal(err)
	}
	spec, ok := ReadSpec(dir)
	if !ok || spec.Raw != "20.11.1" || spec.Source != "package.json engines.node" {
		t.Errorf("engines.node 读取失败: %+v ok=%v", spec, ok)
	}

	if err := os.WriteFile(filepath.Join(dir, ".node-version"), []byte("18.20.4\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	spec, ok = ReadSpec(dir)
	if !ok || spec.Raw != "18.20.4" || spec.Source != ".node-version" {
		t.Errorf(".node-version 应优先于 engines.node: %+v", spec)
	}

	if err := os.WriteFile(filepath.Join(dir, ".nvmrc"), []byte("v20.11.1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	spec, ok = ReadSpec(dir)
	if !ok || spec.Raw != "v20.11.1" || spec.Source != ".nvmrc" {
		t.Errorf(".nvmrc 应优先级最高: %+v", spec)
	}
}

func TestResolvePriority(t *testing.T) {
	available := []Runtime{
		{Version: "18.20.4", Dir: "dir18", Source: SourceNVM},
		{Version: "20.11.1", Dir: "dir20", Source: SourceNVM},
	}
	system := Runtime{Source: SourceSystem, Dir: "sys"}

	cases := []struct {
		name    string
		req     Request
		wantVer string
		wantOrg Origin
		wantErr bool
	}{
		{
			name:    "dev-config 优先",
			req:     Request{Available: available, ConfigVersion: "18", HistoryVersion: "20", Spec: Spec{Raw: "20"}, HasSpec: true, System: system},
			wantVer: "18.20.4",
			wantOrg: OriginConfig,
		},
		{
			name:    "历史次之",
			req:     Request{Available: available, HistoryVersion: "20", Spec: Spec{Raw: "18"}, HasSpec: true, System: system},
			wantVer: "20.11.1",
			wantOrg: OriginHistory,
		},
		{
			name:    "版本声明再次之",
			req:     Request{Available: available, Spec: Spec{Raw: "18", Source: ".nvmrc"}, HasSpec: true, System: system},
			wantVer: "18.20.4",
			wantOrg: OriginSpec,
		},
		{
			name:    "兜底系统默认",
			req:     Request{Available: available, System: system},
			wantOrg: OriginSystem,
		},
		{
			name:    "指定版本未安装要报错",
			req:     Request{Available: available, ConfigVersion: "16", System: system},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := tc.req.Resolve()
			if tc.wantErr {
				var notFound *ErrRuntimeNotFound
				if !errors.As(err, &notFound) {
					t.Fatalf("应返回 ErrRuntimeNotFound，实际 %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("意外错误: %v", err)
			}
			if res.Origin != tc.wantOrg {
				t.Errorf("来源应为 %q，实际 %q", tc.wantOrg, res.Origin)
			}
			if tc.wantVer != "" && res.Runtime.Version != tc.wantVer {
				t.Errorf("版本应为 %q，实际 %q", tc.wantVer, res.Runtime.Version)
			}
		})
	}
}

func TestResolveInvalidSpecFallsBackWithNote(t *testing.T) {
	req := Request{
		Available: []Runtime{{Version: "20.11.1", Dir: "dir20"}},
		Spec:      Spec{Raw: "lts/*", Source: ".nvmrc"},
		HasSpec:   true,
		System:    Runtime{Source: SourceSystem},
	}
	res, err := req.Resolve()
	if err != nil {
		t.Fatalf("无法解析的声明不应报错: %v", err)
	}
	if res.Origin != OriginSystem {
		t.Errorf("应回退系统默认，实际 %q", res.Origin)
	}
	if res.Note == "" {
		t.Error("回退时必须给出说明，否则用户不知道 .nvmrc 没生效")
	}
}
