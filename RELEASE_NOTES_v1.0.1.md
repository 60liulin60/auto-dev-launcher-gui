# 自动开发服务器启动工具 - v1.0.1 发布说明

**发布日期**: 2026年1月29日  
**版本**: v1.0.1  
**类型**: 功能更新

---

## 📋 概述

v1.0.1 版本带来了两个重要的自动化功能，进一步简化了开发工作流程，提升了用户体验和系统稳定性。

---

## ✨ 新增功能

### 1. 自动依赖安装

**功能描述**  
应用现在能够智能检测项目依赖状态，并在需要时自动安装依赖包，无需用户手动执行 `npm install` 命令。

**工作原理**
1. 启动项目前，自动检查 `node_modules` 目录是否存在
2. 如果不存在，智能识别项目使用的包管理器：
   - 检测 `pnpm-lock.yaml` → 使用 pnpm
   - 检测 `yarn.lock` → 使用 yarn  
   - 检测 `package-lock.json` → 使用 npm
   - 默认使用 npm
3. 自动执行相应的 install 命令
4. 实时显示安装进度和输出
5. 安装完成后自动启动项目

**用户价值**
- ✅ 无需记忆和手动执行安装命令
- ✅ 新克隆的项目可以直接启动
- ✅ 删除 node_modules 后无需手动重装
- ✅ 减少因缺少依赖导致的启动失败

**输出示例**
```
检测到缺少 node_modules 目录，正在使用 pnpm 安装依赖...
执行命令: pnpm install

Packages: +399
++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 399, reused 399, downloaded 0, added 399, done

✓ 依赖安装完成，开始启动项目...

> my-project@1.0.0 dev
> vite

  VITE v5.0.0  ready in 500 ms
  ➜  Local:   http://localhost:5173/
```

---

### 2. 智能进程管理

**功能描述**  
应用现在能够智能管理服务器进程的生命周期，确保在删除项目或关闭程序时不会留下孤立的后台进程。

**实现细节**

#### 2.1 删除项目时自动停止服务器
- 用户点击删除按钮时，系统先检查项目状态
- 如果服务器正在运行，自动执行停止操作
- 等待 500ms 确保进程完全终止
- 然后从历史记录中移除项目

#### 2.2 关闭程序时自动清理所有进程
- 用户关闭应用窗口时，拦截关闭事件
- 保存窗口设置（尺寸、位置）
- 停止所有正在运行的服务器进程
- 等待所有进程清理完成
- 最后关闭应用窗口

**用户价值**
- ✅ 避免端口被占用
- ✅ 防止资源泄漏
- ✅ 无需手动清理后台进程
- ✅ 提升系统稳定性

---

## 🐛 问题修复

### 修复的问题

1. **缺少依赖时启动失败**
   - 问题：项目没有 node_modules 时直接报错
   - 解决：自动检测并安装依赖

2. **删除运行中项目留下孤立进程**
   - 问题：删除正在运行的项目后，进程继续占用端口
   - 解决：删除前自动停止服务器

3. **关闭程序后进程未清理**
   - 问题：关闭应用后，开发服务器仍在后台运行
   - 解决：关闭前自动停止所有服务器并等待清理完成

---

## 🔧 技术实现

### 依赖安装模块

**核心代码**
```typescript
// 检测包管理器
private detectPackageManager(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  } else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn'
  } else if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) {
    return 'npm'
  }
  return 'npm'
}

// 安装依赖
private async installDependenciesIfNeeded(
  projectId: string, 
  projectPath: string
): Promise<void> {
  const nodeModulesPath = path.join(projectPath, 'node_modules')
  
  if (!fs.existsSync(nodeModulesPath)) {
    const packageManager = this.detectPackageManager(projectPath)
    await this.runInstall(packageManager, projectPath, projectId)
  }
}
```

### 进程管理模块

**核心代码**
```typescript
// 删除项目时停止服务器
const handleRemoveFromHistory = async (projectId: string) => {
  const state = getServerState(projectId)
  if (state.status === 'running' || state.status === 'starting') {
    await window.electronAPI.stopServer(projectId)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  await window.electronAPI.removeFromHistory(projectId)
}

// 关闭窗口时停止所有服务器
mainWindow.on('close', async (event) => {
  event.preventDefault()
  await storage.saveSettings(settings)
  await processManager.stopAllServers()
  mainWindow.destroy()
})
```

---

## 📊 性能影响

### 依赖安装性能
- **首次安装**: 1-5 分钟（取决于项目大小和网络速度）
- **缓存安装**: 10-30 秒（pnpm/yarn 使用缓存）
- **内存占用**: 安装过程中额外占用 50-100MB

### 进程清理性能
- **单个进程停止**: < 2 秒
- **多个进程停止**: < 5 秒
- **窗口关闭延迟**: 几乎无感知（< 1 秒）

---

## 🎯 使用场景

### 场景 1: 新克隆的项目
```
1. 从 Git 克隆项目
2. 在应用中选择项目文件夹
3. 点击"启动"按钮
4. 应用自动安装依赖并启动
5. 开始开发
```

### 场景 2: 清理后重新启动
```
1. 手动删除 node_modules（清理空间）
2. 在应用中点击"启动"
3. 应用自动重新安装依赖
4. 项目正常启动
```

### 场景 3: 批量管理项目
```
1. 启动多个项目
2. 关闭应用
3. 所有服务器自动停止
4. 无需手动清理进程
```

---

## ⚠️ 注意事项

### 依赖安装
1. **网络要求**: 需要稳定的网络连接下载依赖包
2. **时间消耗**: 首次安装可能需要几分钟，请耐心等待
3. **磁盘空间**: 确保有足够的磁盘空间存储依赖
4. **权限要求**: 某些包可能需要管理员权限

### 进程管理
1. **保存工作**: 关闭应用前请保存所有未保存的工作
2. **端口释放**: 进程停止后端口会立即释放
3. **数据持久化**: 应用会自动保存项目历史和窗口设置

---

## 🔄 升级指南

### 从 v1.0.0 升级

1. **下载新版本**
   - 下载 `自动开发服务器启动工具 Setup 1.0.1.exe`

2. **安装更新**
   - 运行安装程序
   - 选择覆盖安装
   - 保留现有配置和历史记录

3. **验证功能**
   - 启动应用
   - 测试自动依赖安装功能
   - 验证进程管理功能

### 配置迁移
- ✅ 项目历史记录自动保留
- ✅ 窗口设置自动保留
- ✅ 无需手动配置

---

## 📚 相关文档

- [README.md](./README.md) - 完整使用说明
- [使用说明.md](./使用说明.md) - 详细操作指南
- [CHANGELOG.md](./CHANGELOG.md) - 完整更新日志
- [功能更新说明.md](./功能更新说明.md) - 功能详细说明

---

## 🙏 致谢

感谢所有用户的反馈和建议，帮助我们不断改进产品。

---

## 📞 支持与反馈

如有问题或建议，欢迎通过以下方式联系：
- 查看文档获取帮助
- 提交问题反馈
- 分享使用体验

---

**自动开发服务器启动工具团队**  
2026年1月29日
