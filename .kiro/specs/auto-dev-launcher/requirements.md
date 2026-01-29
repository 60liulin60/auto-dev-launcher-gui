# 需求文档

## 简介

自动开发服务器启动工具是一个 Windows 平台的自动化工具，用于简化多项目开发环境的启动流程。该工具能够智能检测项目依赖状态、自动识别包管理器类型、安装缺失的依赖，并启动开发服务器。最终将打包成独立的可执行文件（.exe），方便分发和使用。

## 术语表

- **System**: 自动开发服务器启动工具
- **Project**: 需要启动的 Node.js 项目
- **Package_Manager**: 包管理器（npm、pnpm、yarn、bun 等）
- **Dependencies**: 项目依赖（node_modules 目录）
- **Config_File**: 配置文件（dev-config.json）
- **Dev_Command**: 开发服务器启动命令
- **Lock_File**: 包管理器锁文件（package-lock.json、pnpm-lock.yaml 等）

## 需求

### 需求 1：配置文件管理

**用户故事：** 作为开发者，我希望通过配置文件管理多个项目，以便灵活控制哪些项目需要启动。

#### 验收标准

1. WHEN 系统启动时，THE System SHALL 读取 dev-config.json 配置文件
2. WHEN 配置文件不存在时，THE System SHALL 创建默认配置文件模板
3. WHEN 配置文件格式错误时，THE System SHALL 显示详细的错误信息并终止执行
4. THE System SHALL 支持项目的绝对路径和相对路径配置
5. THE System SHALL 支持通过 enabled 字段控制项目是否启动

### 需求 2：项目路径验证

**用户故事：** 作为开发者，我希望系统能够验证项目路径的有效性，以便及早发现配置错误。

#### 验收标准

1. WHEN 处理项目配置时，THE System SHALL 验证项目路径是否存在
2. WHEN 项目路径不存在时，THE System SHALL 记录错误并跳过该项目
3. WHEN 项目路径存在时，THE System SHALL 验证是否包含 package.json 文件
4. WHEN package.json 不存在时，THE System SHALL 记录警告并跳过该项目
5. THE System SHALL 将相对路径转换为绝对路径进行处理

### 需求 3：依赖检测

**用户故事：** 作为开发者，我希望系统能够自动检测项目是否已安装依赖，以便决定是否需要安装。

#### 验收标准

1. WHEN 验证项目后，THE System SHALL 检查 node_modules 目录是否存在
2. WHEN node_modules 目录不存在时，THE System SHALL 标记该项目需要安装依赖
3. WHEN node_modules 目录存在但为空时，THE System SHALL 标记该项目需要安装依赖
4. WHEN node_modules 目录存在且包含文件时，THE System SHALL 标记该项目依赖已安装
5. THE System SHALL 在日志中显示每个项目的依赖状态

### 需求 4：包管理器识别

**用户故事：** 作为开发者，我希望系统能够自动识别项目使用的包管理器，以便使用正确的命令安装依赖。

#### 验收标准

1. WHEN 项目需要安装依赖时，THE System SHALL 检测项目使用的包管理器类型
2. WHEN 存在 pnpm-lock.yaml 文件时，THE System SHALL 识别为 pnpm
3. WHEN 存在 yarn.lock 文件时，THE System SHALL 识别为 yarn
4. WHEN 存在 bun.lockb 文件时，THE System SHALL 识别为 bun
5. WHEN 存在 package-lock.json 文件时，THE System SHALL 识别为 npm
6. WHEN 不存在任何锁文件时，THE System SHALL 默认使用 npm
7. THE System SHALL 在日志中显示识别到的包管理器类型

### 需求 5：自动依赖安装

**用户故事：** 作为开发者，我希望系统能够自动安装缺失的依赖，以便无需手动执行安装命令。

#### 验收标准

1. WHEN 项目缺少依赖时，THE System SHALL 使用识别到的包管理器安装依赖
2. WHEN 使用 npm 时，THE System SHALL 执行 "npm install" 命令
3. WHEN 使用 pnpm 时，THE System SHALL 执行 "pnpm install" 命令
4. WHEN 使用 yarn 时，THE System SHALL 执行 "yarn install" 命令
5. WHEN 使用 bun 时，THE System SHALL 执行 "bun install" 命令
6. WHEN 依赖安装失败时，THE System SHALL 记录错误并跳过该项目的启动
7. WHEN 依赖安装成功时，THE System SHALL 继续执行项目启动流程
8. THE System SHALL 在安装过程中显示实时进度信息

### 需求 6：启动命令智能选择

**用户故事：** 作为开发者，我希望系统能够智能选择启动命令，以便适配不同项目的配置。

#### 验收标准

1. WHEN 准备启动项目时，THE System SHALL 读取 package.json 中的 scripts 字段
2. WHEN scripts 中存在 "dev" 脚本时，THE System SHALL 优先使用该脚本
3. WHEN scripts 中不存在 "dev" 但存在 "start" 时，THE System SHALL 使用 "start" 脚本
4. WHEN scripts 中不存在 "dev" 和 "start" 但存在 "serve" 时，THE System SHALL 使用 "serve" 脚本
5. WHEN 配置文件中指定了自定义启动命令时，THE System SHALL 使用配置的命令覆盖默认选择
6. WHEN 无法找到合适的启动命令时，THE System SHALL 记录错误并跳过该项目
7. THE System SHALL 使用识别到的包管理器执行启动命令

### 需求 7：多项目并行启动

**用户故事：** 作为开发者，我希望系统能够在独立窗口中启动多个项目，以便同时运行和监控多个服务。

#### 验收标准

1. WHEN 项目准备就绪时，THE System SHALL 在新的命令行窗口中启动该项目
2. WHEN 启动项目时，THE System SHALL 设置窗口标题为项目名称
3. WHEN 启动项目时，THE System SHALL 在窗口中显示项目路径和启动命令
4. THE System SHALL 在启动下一个项目前等待 2 秒
5. THE System SHALL 按照配置文件中的顺序依次启动项目
6. WHEN 所有项目启动完成时，THE System SHALL 显示启动摘要信息

### 需求 8：日志和错误处理

**用户故事：** 作为开发者，我希望系统提供清晰的日志输出，以便了解执行过程和排查问题。

#### 验收标准

1. THE System SHALL 使用不同颜色区分信息、警告和错误日志
2. WHEN 处理每个项目时，THE System SHALL 显示项目名称和路径
3. WHEN 检测依赖状态时，THE System SHALL 显示检测结果
4. WHEN 识别包管理器时，THE System SHALL 显示识别结果
5. WHEN 安装依赖时，THE System SHALL 显示安装进度
6. WHEN 启动项目时，THE System SHALL 显示启动状态
7. WHEN 发生错误时，THE System SHALL 显示详细的错误信息和可能的解决方案
8. THE System SHALL 在执行结束时显示成功和失败的项目统计

### 需求 9：可执行文件打包

**用户故事：** 作为开发者，我希望将工具打包成独立的 exe 文件，以便在没有 Node.js 环境的机器上使用。

#### 验收标准

1. THE System SHALL 支持打包成独立的 Windows 可执行文件
2. WHEN 打包时，THE System SHALL 包含所有必要的运行时依赖
3. WHEN 打包时，THE System SHALL 包含默认配置文件模板
4. THE System SHALL 在首次运行时自动创建配置文件
5. THE System SHALL 支持通过命令行参数指定配置文件路径
6. THE System SHALL 在打包后的文件大小保持合理范围（小于 50MB）

### 需求 10：用户交互和确认

**用户故事：** 作为开发者，我希望在关键操作前能够确认，以便避免意外执行。

#### 验收标准

1. WHEN 检测到项目需要安装依赖时，THE System SHALL 显示待安装项目列表
2. WHEN 显示待安装列表后，THE System SHALL 询问用户是否继续
3. WHEN 用户确认继续时，THE System SHALL 执行依赖安装
4. WHEN 用户取消操作时，THE System SHALL 终止执行
5. WHERE 配置文件中设置了自动模式，THE System SHALL 跳过确认直接执行
6. THE System SHALL 在执行完成后等待用户按键退出

### 需求 11：配置文件扩展功能

**用户故事：** 作为开发者，我希望配置文件支持更多选项，以便更灵活地控制项目启动行为。

#### 验收标准

1. THE System SHALL 支持在配置中指定自定义启动命令
2. THE System SHALL 支持在配置中指定自定义环境变量
3. THE System SHALL 支持在配置中指定工作目录（如果与项目路径不同）
4. THE System SHALL 支持在配置中设置项目启动延迟时间
5. THE System SHALL 支持在配置中设置是否跳过依赖检查
6. WHERE 配置项未指定时，THE System SHALL 使用合理的默认值

### 需求 12：性能和可靠性

**用户故事：** 作为开发者，我希望工具运行稳定可靠，以便提高工作效率。

#### 验收标准

1. THE System SHALL 在 5 秒内完成配置文件读取和验证
2. THE System SHALL 在 10 秒内完成所有项目的依赖检测
3. WHEN 某个项目启动失败时，THE System SHALL 继续处理其他项目
4. WHEN 系统资源不足时，THE System SHALL 显示警告信息
5. THE System SHALL 支持同时启动最多 10 个项目
6. THE System SHALL 正确处理包含特殊字符的路径
7. THE System SHALL 正确处理包含中文字符的路径和项目名称
