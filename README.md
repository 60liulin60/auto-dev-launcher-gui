# 自动开发服务器启动工具

> 一个智能化的开发服务器管理工具，让项目启动变得简单高效

[![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)](https://github.com/yourusername/auto-dev-launcher)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/yourusername/auto-dev-launcher)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 📖 目录

- [概述](#概述)
- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [安装](#安装)
- [使用指南](#使用指南)
- [技术架构](#技术架构)
- [开发指南](#开发指南)
- [常见问题](#常见问题)
- [版本信息](#版本信息)
- [许可证](#许可证)

---

## 概述

自动开发服务器启动工具是一款基于 Electron + React 构建的桌面应用程序，专为前端开发者设计。它通过智能化的项目管理和自动化的依赖处理，显著提升开发效率，让您专注于代码本身。

### 为什么选择我们？

- **零配置启动** - 自动识别项目配置，无需手动编写配置文件
- **智能依赖管理** - 自动检测并安装缺失的依赖包
- **多项目并行** - 同时管理和运行多个开发服务器
- **进程智能清理** - 自动管理进程生命周期，避免资源泄漏
- **现代化界面** - 终端美学设计，提供优雅的用户体验

---

## 核心特性

### 🚀 智能项目管理

#### 自动配置识别
- 自动读取 `package.json` 文件
- 智能识别启动命令（dev → start → serve）
- 自动检测包管理器（pnpm → yarn → npm）
- 无需手动创建配置文件

#### 项目历史记录
- 自动保存常用项目
- 快速访问历史项目
- 记录最后启动时间
- 持久化存储

### 🔄 自动依赖安装

#### 智能检测机制
- 启动前自动检查 `node_modules` 目录
- 智能识别项目使用的包管理器
- 自动执行依赖安装命令
- 实时显示安装进度

#### 包管理器检测规则
```
检测 pnpm-lock.yaml → 使用 pnpm
检测 yarn.lock       → 使用 yarn
检测 package-lock.json → 使用 npm
默认                 → 使用 npm
```

#### 用户体验优化
- 实时输出安装日志
- 显示安装进度条
- 自动处理安装错误
- 安装完成后自动启动项目

### 🛡️ 智能进程管理

#### 生命周期管理
- **删除项目时** - 自动停止正在运行的服务器
- **关闭程序时** - 自动停止所有服务器进程
- **异常退出时** - 确保进程完全清理

#### 进程控制
- 使用 Windows 原生 `taskkill` 命令
- 支持进程树完整清理
- 避免端口占用问题
- 防止资源泄漏

### 📊 实时监控

#### 服务器输出
- 实时显示服务器日志
- 自动移除 ANSI 颜色代码
- URL 自动转换为可点击链接
- 保留最近 100 行输出

#### 状态可视化
- 🔵 **未启动** - 灰色 - 项目尚未启动
- 🟡 **启动中** - 金色 - 正在启动服务器
- 🟢 **运行中** - 绿色 - 服务器正常运行
- ⚫ **已停止** - 灰色 - 服务器已停止
- 🔴 **错误** - 橙色   - 启动失败或运行出错

### 🎨 现代化界面

#### 终端美学设计
- CRT 扫描线效果
- 霓虹发光交互
- 等宽字体显示
- 高对比度配色

#### 交互优化
- 直观的操作按钮
- 清晰的状态指示
- 流畅的动画效果
- 响应式布局

---

## 快速开始

### 前置要求

- Windows 10 或更高版本
- Node.js 14.0 或更高版本
- 已安装包管理器（npm/yarn/pnpm）

### 5 分钟快速上手

1. **下载并安装应用**
   ```
   运行 自动开发服务器启动工具 Setup 1.0.1.exe
   ```

2. **添加项目**
   - 点击 "📁 选择项目文件夹"
   - 选择包含 `package.json` 的项目目录

3. **启动项目**
   - 点击项目卡片选中项目
   - 点击 "▶️ 启动" 按钮
   - 应用自动安装依赖（如需要）并启动

4. **查看输出**
   - 右侧面板实时显示服务器输出
   - 点击 URL 直接在浏览器中打开

5. **停止项目**
   - 点击 "⏹️ 停止" 按钮停止服务器

---

## 安装

### 方式一：安装程序（推荐）

**适用场景**: 长期使用，需要开机自启动

1. 下载安装程序
   ```
   自动开发服务器启动工具 Setup 1.0.1.exe (92.51 MB)
   ```

2. 运行安装向导
   - 双击安装程序
   - 选择安装位置
   - 完成安装

3. 启动应用
   - 从桌面快捷方式启动
   - 或从开始菜单启动

**安装位置**:
```
C:\Program Files\自动开发服务器启动工具\
```

**用户数据**:
```
C:\Users\{用户名}\AppData\Roaming\auto-dev-launcher-gui\
```

### 方式二：便携版本

**适用场景**: 临时使用，无需安装

1. 解压文件
   ```
   release-final/win-unpacked/ (203.69 MB)
   ```

2. 运行程序
   ```
   双击 自动开发服务器启动工具.exe
   ```

3. 开始使用
   - 无需安装
   - 可放置在任意位置
   - 支持 U 盘运行

---

## 使用指南

### 项目管理

#### 添加项目

**方法一：通过文件选择器**

1. 点击顶部 "📁 选择项目文件夹" 按钮
2. 在弹出的对话框中选择项目根目录
3. 应用自动读取配置并添加到列表

**方法二：使用配置文件（可选）**

在项目根目录创建 `dev-config.json`:
```json
{
  "name": "我的项目",
  "command": "pnpm run dev",
  "cwd": "/path/to/project",
  "env": {
    "NODE_ENV": "development",
    "PORT": "3000"
  }
}
```

#### 启动项目

**标准启动流程**:
1. 在项目列表中点击选中项目
2. 点击 "▶️ 启动" 按钮
3. 等待依赖安装（如需要）
4. 查看服务器输出

**自动依赖安装**:
```
检测到缺少 node_modules 目录，正在使用 pnpm 安装依赖...
执行命令: pnpm install

Packages: +399
Progress: resolved 399, reused 399, downloaded 0, added 399, done

✓ 依赖安装完成，开始启动项目...

> my-project@1.0.0 dev
> vite

  VITE v5.0.0  ready in 500 ms
  ➜  Local:   http://localhost:5173/
```

#### 停止项目

1. 选中正在运行的项目
2. 点击 "⏹️ 停止" 按钮
3. 等待进程完全终止

#### 管理项目

- **📂 打开** - 在文件管理器中打开项目文件夹
- **🗑️ 删除** - 从历史记录中删除（不会删除文件）
  - 自动停止正在运行的服务器
  - 从历史记录中移除
  - 清理相关状态

### 多项目管理

#### 并行运行

**支持场景**:
- 前端 + 后端同时运行
- 多个微服务并行开发
- 主项目 + 文档站点

**操作步骤**:
1. 添加多个项目到列表
2. 依次启动需要的项目
3. 在不同项目间切换查看输出
4. 统一管理所有运行中的服务器

#### 批量操作

**关闭所有服务器**:
- 直接关闭应用窗口
- 应用自动停止所有服务器
- 确保进程完全清理

### 输出日志

#### 查看日志

- 选中项目后，右侧面板显示实时输出
- 自动滚动到最新日志
- 保留最近 100 行输出

#### URL 链接

- 输出中的 URL 自动转换为可点击链接
- 点击链接在默认浏览器中打开
- 支持 HTTP 和 HTTPS 协议

#### 日志过滤

- 自动移除 ANSI 颜色代码
- 清理控制字符
- 保持输出清晰可读

---

## 技术架构

### 技术栈

#### 前端技术
- **React 19.2.4** - 声明式 UI 框架
- **TypeScript 5.9.3** - 类型安全的 JavaScript
- **Vite 7.3.1** - 快速的前端构建工具

#### 桌面框架
- **Electron 40.0.0** - 跨平台桌面应用框架
- **Node.js** - JavaScript 运行时

#### 开发工具
- **pnpm** - 高效的包管理器
- **Vitest 4.0.18** - 单元测试框架
- **fast-check 4.5.3** - 属性测试库

### 项目结构

```
auto-dev-launcher-gui/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主进程入口
│   │   ├── ipc-handlers.ts      # IPC 通信处理
│   │   ├── process-manager.ts   # 进程管理器
│   │   ├── storage.ts           # 数据存储
│   │   ├── validation.ts        # 配置验证
│   │   └── preload.ts           # Preload 脚本
│   ├── renderer/                # React 渲染进程
│   │   ├── App.tsx              # 主应用组件
│   │   ├── App.css              # 样式文件
│   │   └── main.tsx             # 渲染进程入口
│   └── shared/                  # 共享代码
│       ├── types.ts             # TypeScript 类型定义
│       └── constants.ts         # 常量定义
├── dist/                        # 编译输出目录
├── release-final/               # 打包输出目录
├── package.json                 # 项目配置
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 配置
└── README.md                    # 项目文档
```

### 核心模块

#### 进程管理器 (ProcessManager)

**职责**:
- 管理开发服务器进程的生命周期
- 处理进程启动、停止、监控
- 自动检测并安装依赖
- 转发进程输出到渲染进程

**关键方法**:
```typescript
startServer(projectId, projectPath, config)  // 启动服务器
stopServer(projectId)                        // 停止服务器
stopAllServers()                             // 停止所有服务器
installDependenciesIfNeeded(projectId, path) // 安装依赖
detectPackageManager(projectPath)            // 检测包管理器
```

#### 存储管理器 (StorageManager)

**职责**:
- 管理项目历史记录
- 保存应用设置
- 持久化窗口状态

**存储位置**:
```
C:\Users\{用户名}\AppData\Roaming\auto-dev-launcher-gui\
├── project-history.json  # 项目历史
└── settings.json         # 应用设置
```

#### IPC 通信处理 (IPC Handlers)

**职责**:
- 处理渲染进程和主进程之间的通信
- 提供文件系统操作接口
- 转发进程事件

**通信频道**:
```typescript
'project:select-folder'    // 选择文件夹
'project:load-config'      // 加载配置
'server:start'             // 启动服务器
'server:stop'              // 停止服务器
'server:output'            // 服务器输出
'history:load'             // 加载历史
'history:add'              // 添加历史
'history:remove'           // 删除历史
```

---

## 开发指南

### 环境准备

#### 系统要求
- Windows 10 或更高版本
- Node.js 16.0 或更高版本
- pnpm 8.0 或更高版本

#### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/yourusername/auto-dev-launcher-gui.git
cd auto-dev-launcher-gui

# 安装依赖
pnpm install
```

### 开发模式

#### 启动开发服务器

```bash
# 终端 1: 启动 Vite 开发服务器
pnpm run dev

# 终端 2: 启动 Electron
pnpm run dev:electron
```

#### 热重载
- 渲染进程支持热重载
- 主进程修改需要重启 Electron

### 构建

#### 编译代码

```bash
# 编译所有代码
pnpm run build

# 单独编译
pnpm run build:renderer  # 编译渲染进程
pnpm run build:main      # 编译主进程
pnpm run build:preload   # 编译 preload 脚本
```

#### 打包应用

```bash
# 打包 Windows 版本
pnpm run package:win
```

**输出位置**:
```
release-final/
├── win-unpacked/                           # 便携版本
│   └── 自动开发服务器启动工具.exe
└── 自动开发服务器启动工具 Setup 1.0.1.exe  # 安装程序
```

### 测试

#### 运行测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm run test:watch
```

#### 测试覆盖
- 单元测试 (Vitest)
- 属性测试 (fast-check)
- 集成测试

### 代码规范

#### TypeScript
- 严格模式启用
- 完整的类型定义
- 避免使用 `any`

#### 命名规范
- 文件名: kebab-case
- 组件名: PascalCase
- 函数名: camelCase
- 常量名: UPPER_SNAKE_CASE

---

## 常见问题

### 安装和启动

#### Q: 项目没有 node_modules，可以直接启动吗？

**A**: 可以！应用会自动处理：
1. 检测项目使用的包管理器
2. 自动执行 install 命令
3. 实时显示安装进度
4. 安装完成后自动启动项目

**注意**: 首次安装可能需要 1-5 分钟，取决于项目大小和网络速度。

#### Q: 为什么提示"未找到 package.json"？

**A**: 请确保：
- 选择的是项目根目录
- 目录中包含 `package.json` 文件
- 文件格式正确，可以被解析

#### Q: 启动失败怎么办？

**A**: 按以下步骤排查：
1. 查看右侧输出面板的错误信息
2. 检查 package.json 中是否有启动脚本
3. 确认网络连接正常（用于下载依赖）
4. 验证包管理器已正确安装

### 功能使用

#### Q: 可以同时启动多个项目吗？

**A**: 可以！
- 每个项目都是独立的进程
- 支持前端 + 后端同时运行
- 可以在不同项目间切换查看输出
- 统一管理所有运行中的服务器

#### Q: 关闭应用后服务器会停止吗？

**A**: 会的。应用关闭时会：
1. 自动停止所有正在运行的服务器
2. 等待进程完全终止
3. 清理所有相关资源
4. 确保不会留下后台进程

#### Q: 删除项目时会停止服务器吗？

**A**: 会的。删除项目前会：
1. 检查项目是否正在运行
2. 自动停止正在运行的服务器
3. 等待 500ms 确保进程终止
4. 从历史记录中删除项目

**注意**: 删除操作不会删除项目文件，只是从历史记录中移除。

### 依赖管理

#### Q: 依赖安装需要多长时间？

**A**: 取决于多个因素：
- **项目大小**: 依赖包数量
- **网络速度**: 下载速度
- **缓存状态**: pnpm/yarn 可能使用缓存

**典型时间**:
- 小型项目: 30秒 - 1分钟
- 中型项目: 1-3 分钟
- 大型项目: 3-5 分钟

#### Q: 安装失败怎么办？

**A**: 常见解决方案：
1. **检查网络**: 确保可以访问 npm registry
2. **清理缓存**: 手动清理包管理器缓存
3. **手动安装**: 在项目目录手动运行 install
4. **查看日志**: 右侧输出面板显示详细错误

### 进程管理

#### Q: 如何确认服务器已完全停止？

**A**: 观察以下指标：
- 状态徽章变为"已停止"（灰色）
- 输出面板停止更新
- 端口被释放（可以重新启动）

#### Q: 端口被占用怎么办？

**A**: 应用会自动处理：
- 使用 `taskkill /T /F` 强制终止进程树
- 确保端口完全释放
- 如果仍有问题，可以手动检查任务管理器

### 界面和交互

#### Q: 如何查看完整的错误信息？

**A**: 
- 选中项目后，右侧面板显示所有输出
- 包括错误堆栈和详细信息
- 输出中的 URL 可以直接点击

#### Q: 输出日志太多怎么办？

**A**: 
- 应用自动保留最近 100 行
- 旧的日志会自动清理
- 可以滚动查看历史输出

---

## 版本信息

### 当前版本

- **版本号**: v1.0.1
- **发布日期**: 2026年1月29日
- **支持平台**: Windows 10+
- **许可证**: MIT

### 版本历史

#### v1.0.1 (2026-01-29)
- ✨ 新增自动依赖安装功能
- ✨ 新增智能进程管理功能
- 🐛 修复缺少依赖时启动失败的问题
- 🐛 修复删除运行中项目可能留下进程的问题
- 🐛 修复关闭程序时进程未清理的问题

#### v1.0.0 (2026-01-29)
- 🎉 首次发布
- ✨ 自动配置识别
- ✨ 项目历史记录
- ✨ 实时服务器输出
- ✨ 状态可视化
- ✨ 现代化界面

### 文件大小

- **安装程序**: 92.51 MB
- **便携版本**: 203.69 MB
- **安装后**: 约 250 MB

---

## 相关文档

### 用户文档
- [快速入门指南](./快速入门指南.md) - 5分钟快速上手
- [使用说明](./使用说明.md) - 详细操作指南
- [文档索引](./文档索引.md) - 完整文档导航

### 版本文档
- [更新日志](./CHANGELOG.md) - 完整版本历史
- [发布说明](./RELEASE_NOTES_v1.0.1.md) - v1.0.1 详细说明
- [功能更新说明](./功能更新说明.md) - 新功能详解

### 技术文档
- [设计说明](./DESIGN_NOTES.md) - UI设计理念
- [最终版本说明](./最终版本说明.md) - 完整技术说明

---

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

```
MIT License

Copyright (c) 2026 自动开发服务器启动工具

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 支持与反馈

### 获取帮助

- 📖 查看[文档索引](./文档索引.md)获取完整文档
- 💬 查看[常见问题](#常见问题)寻找答案
- 📧 提交问题反馈

### 贡献

欢迎贡献代码、报告问题或提出建议！

---

## 致谢

感谢所有用户的支持和反馈，帮助我们不断改进产品。

---

<div align="center">

**自动开发服务器启动工具** - 让开发更高效

Made with ❤️ by Development Team

[下载](https://github.com/yourusername/auto-dev-launcher/releases) · [文档](./文档索引.md) · [反馈](https://github.com/yourusername/auto-dev-launcher/issues)

</div>
