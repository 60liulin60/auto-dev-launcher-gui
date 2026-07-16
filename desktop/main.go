package main

import (
	"embed"
	"log"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// windowTitle 主窗口标题。
const windowTitle = "开发服务器启动工具"

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
