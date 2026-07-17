package main

import (
	_ "embed"
	"runtime"

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

	// systray 在 Windows 上用「创建托盘窗口 + GetMessage 消息泵」实现，二者必须在
	// 同一个 OS 线程上：Windows 消息队列按线程隔离，GetMessage 只能取到本线程所建
	// 窗口的消息。systray 包的 init() 调了 LockOSThread，是假定调用方从已锁定的线程
	// 直接跑 Run；但这里必须用独立 goroutine（Run 会阻塞，不能占用 Wails 主线程）。
	// 新 goroutine 默认未锁定，Go 调度器可能把窗口创建和消息泵调度到不同 OS 线程，
	// 导致托盘点击（单击/右键）永远收不到 → 图标能显示但菜单弹不出、无法退出。
	// 因此在此 goroutine 内显式 LockOSThread，把两者钉在同一线程上。
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		systray.Run(onReady, onExit)
	}()
}
