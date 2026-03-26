const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const tauriConfigPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json')
const requiredIcons = ['icons/icon.png', 'icons/icon.ico']

let hasErrors = false

function fail(message) {
  console.error(`❌ ${message}`)
  hasErrors = true
}

function pass(message) {
  console.log(`✅ ${message}`)
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} 不存在: ${filePath}`)
    return
  }

  const size = fs.statSync(filePath).size
  pass(`${label} 存在 (${(size / 1024).toFixed(2)} KB)`)
}

console.log('📦 校验 Tauri 图标配置...\n')

ensureFile(tauriConfigPath, 'Tauri 配置文件')

if (fs.existsSync(tauriConfigPath)) {
  const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'))
  const bundleIcons = tauriConfig.bundle?.icon

  if (!Array.isArray(bundleIcons) || bundleIcons.length === 0) {
    fail('`src-tauri/tauri.conf.json` 缺少 `bundle.icon` 配置')
  } else {
    pass(`bundle.icon 已配置 ${bundleIcons.length} 个图标条目`)

    for (const expectedIcon of requiredIcons) {
      if (bundleIcons.includes(expectedIcon)) {
        pass(`bundle.icon 包含 ${expectedIcon}`)
      } else {
        fail(`bundle.icon 缺少 ${expectedIcon}`)
      }
    }

    for (const iconPath of bundleIcons) {
      ensureFile(path.join(projectRoot, 'src-tauri', iconPath), `Tauri 图标 ${iconPath}`)
    }
  }
}

console.log('\n📁 同步检查源图标...')
ensureFile(path.join(projectRoot, 'build', 'icon.png'), 'build/icon.png')
ensureFile(path.join(projectRoot, 'build', 'icon.ico'), 'build/icon.ico')

console.log('\n' + '─'.repeat(48))

if (hasErrors) {
  console.error('❌ 图标校验失败，请先修复配置再打包。')
  process.exit(1)
}

console.log('✅ 图标校验通过，可以继续执行 Tauri 打包。')
console.log('   下一步: pnpm run package:win')
