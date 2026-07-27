package main

import (
	"embed"
	"log"
	"os"
	"time"

	"github.com/60liulin60/auto-dev-launcher-gui/refactor/internal/platform"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// windowTitle 主窗口标题。
const windowTitle = "开发服务器启动工具"

// startsMinimized 检测是否以「静默启动到托盘」模式被拉起。
// 开机自启时注册表里追加 --minimized，命中即让 Wails 用 StartHidden 建窗口，
// 只显示托盘图标，跳过登录后的窗口渲染/WebView 展示阻塞。
func startsMinimized() bool {
	for _, arg := range os.Args[1:] {
		if arg == platform.MinimizedFlag {
			return true
		}
	}
	return false
}

func main() {
	app, err := NewApp()
	if err != nil {
		log.Fatalf("应用初始化失败: %v", err)
	}

	err = wails.Run(&options.App{
		Title:  windowTitle,
		Width:  1200,
		Height: 800,
		// Frameless 去掉系统边框和标题栏，由前端 TitleBar 组件自绘主题色标题栏，
		// 使 Windows 10/11 都显示应用主题色（DWM CAPTION_COLOR 仅 Win11 有效，故不用）。
		Frameless: true,
		// StartHidden：--minimized 命中时窗口不弹出，仅托盘图标出现；
		// 用户点击托盘“显示主窗口”再走 WindowShow 路径。
		StartHidden: startsMinimized(),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:     app.startup,
		OnShutdown:    app.shutdown,
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
	})
	if err != nil {
		log.Fatalf("应用运行失败: %v", err)
	}
}

// currentTimestampMS 返回当前毫秒时间戳（历史记录用）。
func currentTimestampMS() uint64 {
	return uint64(time.Now().UnixMilli())
}
