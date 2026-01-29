---
inclusion: manual
---

# 外部技能引用

本文档引用了位于 `E:\otherObeject\skills` 的 Anthropic Agent Skills 仓库中的技能。

## 可用技能列表

### 1. Frontend Design (前端设计)
**路径**: `E:\otherObeject\skills\skills\frontend-design`
**用途**: 创建独特的、生产级别的前端界面，避免通用的 AI 美学
**适用场景**: 
- 构建 Web 组件、页面、应用
- 创建 React/Vue 组件
- 设计 HTML/CSS 布局
- 美化 Web UI

### 2. MCP Builder (MCP 服务器构建器)
**路径**: `E:\otherObeject\skills\skills\mcp-builder`
**用途**: 创建高质量的 MCP (Model Context Protocol) 服务器
**适用场景**:
- 构建 MCP 服务器
- 集成外部 API 或服务
- Python (FastMCP) 或 Node/TypeScript (MCP SDK) 开发

### 3. Web Artifacts Builder (Web 工件构建器)
**路径**: `E:\otherObeject\skills\skills\web-artifacts-builder`
**用途**: 构建 Web 工件和应用
**适用场景**: 快速创建 Web 应用原型

### 4. Webapp Testing (Web 应用测试)
**路径**: `E:\otherObeject\skills\skills\webapp-testing`
**用途**: 测试 Web 应用
**适用场景**: 自动化 Web 应用测试

### 5. Skill Creator (技能创建器)
**路径**: `E:\otherObeject\skills\skills\skill-creator`
**用途**: 创建自定义技能
**适用场景**: 开发新的 Agent Skills

### 6. Document Skills (文档技能)
- **DOCX**: `E:\otherObeject\skills\skills\docx` - Word 文档处理
- **PDF**: `E:\otherObeject\skills\skills\pdf` - PDF 文档处理
- **PPTX**: `E:\otherObeject\skills\skills\pptx` - PowerPoint 处理
- **XLSX**: `E:\otherObeject\skills\skills\xlsx` - Excel 处理

### 7. Creative Skills (创意技能)
- **Algorithmic Art**: `E:\otherObeject\skills\skills\algorithmic-art` - 算法艺术
- **Canvas Design**: `E:\otherObeject\skills\skills\canvas-design` - Canvas 设计
- **Theme Factory**: `E:\otherObeject\skills\skills\theme-factory` - 主题工厂
- **Slack GIF Creator**: `E:\otherObeject\skills\skills\slack-gif-creator` - GIF 创建

### 8. Enterprise Skills (企业技能)
- **Brand Guidelines**: `E:\otherObeject\skills\skills\brand-guidelines` - 品牌指南
- **Internal Comms**: `E:\otherObeject\skills\skills\internal-comms` - 内部沟通
- **Doc Coauthoring**: `E:\otherObeject\skills\skills\doc-coauthoring` - 文档协作

## 如何使用这些技能

### 方法 1: 直接引用技能文件
当你需要使用某个技能时，可以要求我读取对应的 SKILL.md 文件：

```
请读取 E:\otherObeject\skills\skills\frontend-design\SKILL.md 并使用该技能帮我设计一个现代化的登录页面
```

### 方法 2: 复制技能到项目
如果需要频繁使用某个技能，可以将其复制到项目的 `.kiro/steering` 目录：

```powershell
Copy-Item "E:\otherObeject\skills\skills\frontend-design\SKILL.md" ".kiro\steering\frontend-design.md"
```

### 方法 3: 使用 #[[file:]] 引用
在其他 steering 文件或 spec 文件中，可以使用文件引用：

```markdown
#[[file:E:\otherObeject\skills\skills\frontend-design\SKILL.md]]
```

## 示例用法

### 示例 1: 使用 Frontend Design 技能
```
使用 frontend-design 技能，为我的自动开发服务器启动工具创建一个更现代、更独特的 UI 设计
```

### 示例 2: 使用 MCP Builder 技能
```
使用 mcp-builder 技能，帮我创建一个 MCP 服务器来集成 GitHub API
```

### 示例 3: 使用 PDF 技能
```
使用 PDF 技能，从这个 PDF 文件中提取表单字段
```

## 注意事项

1. 这些技能文件位于工作区外部，我需要通过 PowerShell 命令来访问
2. 某些技能可能包含 Python 脚本或其他资源文件
3. 使用技能前，请确保理解其用途和限制
4. 某些技能是开源的 (Apache 2.0)，某些是 source-available

## 技能规范

完整的 Agent Skills 规范位于：
`E:\otherObeject\skills\spec\agent-skills-spec.md`

## 技能模板

创建自定义技能的模板位于：
`E:\otherObeject\skills\template\SKILL.md`
