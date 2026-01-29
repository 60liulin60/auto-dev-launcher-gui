/**
 * 清理打包输出目录
 */
const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'release');

function cleanRelease() {
  if (!fs.existsSync(releaseDir)) {
    console.log('✓ release 目录不存在,无需清理');
    return;
  }

  try {
    // 尝试删除目录
    fs.rmSync(releaseDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
    console.log('✓ 已清理 release 目录');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      console.warn('⚠ 无法删除 release 目录 - 文件可能正在使用');
      console.warn('  请手动关闭所有应用实例后重试');
      console.warn('  或手动删除 release 目录');
      process.exit(1);
    } else {
      console.error('✗ 清理失败:', error.message);
      process.exit(1);
    }
  }
}

cleanRelease();
