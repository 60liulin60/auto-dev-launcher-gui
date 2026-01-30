# 🎨 UI 设计说明 - 工业极简主义 + 终端美学

## 设计理念

使用 **frontend-design** 技能重新设计的界面，灵感来自开发者熟悉的终端环境，创造了一个独特、令人难忘的开发工具界面。

## 美学方向：工业极简主义 + 终端美学

### 核心特征
- **终端启发**：深色背景、等宽字体、高对比度配色
- **CRT 屏幕效果**：微妙的扫描线和网格背景
- **霓虹发光**：青色和绿色的发光效果
- **无圆角设计**：所有元素使用直角，强调工业感
- **命令行风格**：按钮使用方括号标记 `[RUN]` `[STOP]`

## 配色方案

```css
--terminal-bg: #0a0e27        /* 深蓝黑背景 */
--terminal-surface: #151b3d   /* 表面层 */
--terminal-border: #1e2749    /* 边框 */
--accent-cyan: #00f0ff        /* 青色强调 */
--accent-green: #00ff88       /* 绿色强调 */
--accent-orange: #ff6b35      /* 橙色警告 */
--text-primary: #e0e6ff       /* 主要文本 */
--text-secondary: #8892b0     /* 次要文本 */
--text-dim: #495670           /* 暗淡文本 */
```

## 字体选择

### JetBrains Mono
- **用途**：所有代码和数据显示
- **特点**：专为开发者设计的等宽字体，清晰易读
- **应用**：路径、时间戳、按钮、输出日志

### Space Grotesk
- **用途**：标题和重要标签
- **特点**：现代几何无衬线字体，科技感强
- **应用**：页面标题、项目名称

## 视觉效果

### 1. CRT 扫描线
```css
background: repeating-linear-gradient(
  0deg,
  rgba(0, 0, 0, 0.15),
  rgba(0, 0, 0, 0.15) 1px,
  transparent 1px,
  transparent 2px
);
```
模拟老式 CRT 显示器的扫描线效果

### 2. 网格背景
```css
background-image: 
  linear-gradient(var(--terminal-border) 1px, transparent 1px),
  linear-gradient(90deg, var(--terminal-border) 1px, transparent 1px);
background-size: 50px 50px;
```
创造科技感的网格背景

### 3. 霓虹发光
```css
box-shadow: 0 0 20px var(--glow-cyan);
text-shadow: 0 0 10px var(--glow-cyan);
```
青色和绿色的发光效果，增强科技感

### 4. 闪烁光标
```css
@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
```
Header 中的 `>` 符号模拟终端光标

## 交互设计

### 项目卡片
- **默认状态**：灰色左边框
- **悬停状态**：青色左边框 + 发光 + 向右移动 + 显示 `▸` 箭头
- **选中状态**：绿色左边框 + 绿色背景 + 绿色箭头

### 按钮
- **透明背景**：边框和文字使用主题色
- **悬停效果**：填充背景色 + 发光效果 + 扫光动画
- **文字风格**：全大写 + 方括号包裹 `[RUN]`

### 输出日志
- **淡入动画**：每行输出从左侧淡入
- **URL 链接**：青色虚线下划线，悬停变绿色
- **终端提示符**：`$ ` 符号固定在顶部

## 区域标识

### 注释标签
```
// PROJECT INSTANCES
// STDOUT
```
使用代码注释风格标识不同区域

### 状态徽章
- **IDLE** - 灰色
- **STARTING** - 金色
- **RUNNING** - 绿色
- **STOPPED** - 灰色
- **ERROR** - 橙色

## 与原设计对比

| 特性 | 原设计 | 新设计 |
|------|--------|--------|
| 背景 | 紫色渐变 | 深蓝黑 + 网格 |
| 字体 | 系统字体 | JetBrains Mono + Space Grotesk |
| 圆角 | 12px | 0px (直角) |
| 按钮 | 实心填充 + emoji | 透明边框 + 方括号 |
| 配色 | 柔和渐变 | 高对比度霓虹 |
| 效果 | 阴影 | 发光 + 扫描线 |
| 风格 | 现代通用 | 终端/工业 |

## 设计原则

1. **避免通用 AI 美学**
   - ❌ 紫色渐变
   - ❌ Inter/Roboto 字体
   - ❌ 圆角卡片
   - ✅ 独特的终端美学

2. **功能性优先**
   - 高对比度确保可读性
   - 等宽字体便于扫描代码
   - 清晰的状态指示

3. **一致性**
   - 所有元素使用直角
   - 统一的发光效果
   - 一致的间距和排版

4. **令人难忘**
   - CRT 扫描线效果
   - 闪烁的终端光标
   - 霓虹发光的交互

## 技术实现

### CSS 变量
使用 CSS 自定义属性管理主题色，便于维护和扩展

### 伪元素
大量使用 `::before` 和 `::after` 创建装饰效果，无需额外 DOM 元素

### 动画
- `blink` - 光标闪烁
- `fadeIn` - 输出淡入
- 按钮扫光效果

### 字体加载
通过 Google Fonts CDN 加载自定义字体

## 未来改进方向

1. **主题切换**：添加亮色主题选项
2. **自定义配色**：允许用户自定义强调色
3. **更多动画**：启动时的加载动画
4. **音效**：可选的终端音效反馈
5. **ASCII 艺术**：在空状态显示 ASCII 艺术

## 设计灵感来源

- 经典终端界面 (Unix/Linux)
- Cyberpunk 美学
- 80 年代 CRT 显示器
- 现代开发工具 (VS Code, iTerm2)
- Tron 电影视觉风格

---

**设计工具**: Anthropic Agent Skills - frontend-design
**设计日期**: 2026-01-29
**版本**: v2.0 Terminal Edition
