package main

import (
	_ "embed"

	"github.com/getlantern/systray"
)

// trayIcon 嵌入托盘图标（Windows 使用 .ico）。
//
//go:embed build/icon.ico
var trayIcon []byte

// startTray 在独立 goroutine 中运行 systray 事件循环。
// systray.Run 会阻塞直到 systray.Quit 被调用，因此必须在 goroutine 中启动，
// 不能占用 Wails 主线程。菜单回调复刻现网 Tauri 托盘行为：
// “显示主窗口” -> showMainWindow；“退出” -> requestExit。
func startTray(app *App) {
	onReady := func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("开发服务器启动工具")
		systray.SetTooltip("开发服务器启动工具")

		showItem := systray.AddMenuItem("显示主窗口", "显示并聚焦主窗口")
		systray.AddSeparator()
		exitItem := systray.AddMenuItem("退出", "停止所有服务并退出应用")

		go func() {
			for {
				select {
				case <-showItem.ClickedCh:
					app.showMainWindow()
				case <-exitItem.ClickedCh:
					app.requestExit()
					return
				}
			}
		}()
	}

	// onExit 在 systray.Quit 后触发，无需额外清理（子进程由 requestExit 处理）。
	onExit := func() {}

	go systray.Run(onReady, onExit)
}
