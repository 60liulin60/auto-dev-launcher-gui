const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const bundleRoot = path.join(projectRoot, 'src-tauri', 'target', 'release', 'bundle')
const outputRoot = path.join(projectRoot, 'release-packages')

function ensureCleanDirectory(directoryPath) {
  fs.rmSync(directoryPath, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 300,
  })

  fs.mkdirSync(directoryPath, { recursive: true })
}

function collectBundleFiles() {
  if (!fs.existsSync(bundleRoot)) {
    throw new Error(`Bundle output not found: ${bundleRoot}`)
  }

  const bundleDirectories = fs
    .readdirSync(bundleRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  const files = []

  for (const directoryEntry of bundleDirectories) {
    const directoryPath = path.join(bundleRoot, directoryEntry.name)
    const directFiles = fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(directoryPath, entry.name))

    files.push(...directFiles)
  }

  return files
}

function moveFile(sourcePath, targetPath) {
  try {
    fs.renameSync(sourcePath, targetPath)
  } catch (error) {
    if (error && error.code === 'EXDEV') {
      fs.copyFileSync(sourcePath, targetPath)
      fs.unlinkSync(sourcePath)
      return
    }

    throw error
  }
}

function moveFiles(files) {
  for (const filePath of files) {
    const fileName = path.basename(filePath)
    const targetPath = path.join(outputRoot, fileName)
    moveFile(filePath, targetPath)
    console.log(`Moved ${fileName} -> release-packages/${fileName}`)
  }
}

try {
  const bundleFiles = collectBundleFiles()

  if (bundleFiles.length === 0) {
    throw new Error(`No package artifacts found in ${bundleRoot}`)
  }

  ensureCleanDirectory(outputRoot)
  moveFiles(bundleFiles)

  console.log(`Moved ${bundleFiles.length} package artifact(s) into release-packages`)
} catch (error) {
  console.error('Collect release packages failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
}
