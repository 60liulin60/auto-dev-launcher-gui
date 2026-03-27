const fs = require('fs')
const path = require('path')

const targets = [
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, '..', 'release'),
  path.join(__dirname, '..', 'release-final'),
  path.join(__dirname, '..', 'release-packages'),
  path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle'),
]

function removeTarget(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return
  }

  fs.rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 300,
  })

  console.log(`Removed ${targetPath}`)
}

try {
  targets.forEach(removeTarget)
} catch (error) {
  console.error('Clean failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
}
