/**
 * 配置验证
 * 验证 dev-config.json 文件的格式和内容
 */

import { DevConfig, ValidationResult, ValidationError } from '../shared/types'
import { VALIDATION_RULES, ERROR_MESSAGES } from '../shared/constants'

/**
 * 验证开发配置
 */
export function validateDevConfig(config: any): ValidationResult {
  const errors: ValidationError[] = []

  // 检查配置对象是否存在
  if (!config || typeof config !== 'object') {
    errors.push({
      field: 'config',
      message: '配置必须是一个对象',
    })
    return { valid: false, errors }
  }

  // 检查必需字段 - 只检查 command 和 cwd
  if (!config.command || typeof config.command !== 'string') {
    errors.push({
      field: 'command',
      message: '缺少必需字段: command',
    })
  } else if (config.command.trim().length === 0) {
    errors.push({
      field: 'command',
      message: '命令不能为空',
    })
  }

  if (!config.cwd || typeof config.cwd !== 'string') {
    errors.push({
      field: 'cwd',
      message: '缺少必需字段: cwd',
    })
  } else if (config.cwd.trim().length === 0) {
    errors.push({
      field: 'cwd',
      message: '工作目录不能为空',
    })
  }

  // 验证可选字段
  if (config.env !== undefined) {
    if (typeof config.env !== 'object' || Array.isArray(config.env)) {
      errors.push({
        field: 'env',
        message: '环境变量必须是对象类型',
      })
    }
  }

  if (config.port !== undefined) {
    if (typeof config.port !== 'number') {
      errors.push({
        field: 'port',
        message: '端口号必须是数字类型',
      })
    } else if (config.port < 1 || config.port > 65535) {
      errors.push({
        field: 'port',
        message: '端口号必须在 1-65535 之间',
      })
    }
  }

  if (config.name !== undefined && typeof config.name !== 'string') {
    errors.push({
      field: 'name',
      message: '项目名称必须是字符串类型',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 验证 JSON 语法
 */
export function validateJSON(content: string): { valid: boolean; error?: string } {
  try {
    JSON.parse(content)
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 从 JSON 字符串解析配置
 */
export function parseDevConfig(content: string): DevConfig | null {
  try {
    const config = JSON.parse(content)
    const validation = validateDevConfig(config)
    
    if (!validation.valid) {
      return null
    }
    
    return config as DevConfig
  } catch (error) {
    return null
  }
}
