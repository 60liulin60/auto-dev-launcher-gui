/**
 * 图标验证脚本
 * 验证图标文件和配置是否正确
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 验证图标配置...\n');

let hasErrors = false;

// 1. 检查 PNG 源文件
const pngPath = path.join(__dirname, '../build/icon.png');
if (fs.existsSync(pngPath)) {
  const stats = fs.statSync(pngPath);
  console.log('✅ PNG 源文件存在');
  console.log(`   路径: ${pngPath}`);
  console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB\n`);
} else {
  console.error('❌ PNG 源文件不存在:', pngPath);
  hasErrors = true;
}

// 2. 检查 ICO 文件
const icoPath = path.join(__dirname, '../build/icon.ico');
if (fs.existsSync(icoPath)) {
  const stats = fs.statSync(icoPath);
  console.log('✅ ICO 文件存在');
  console.log(`   路径: ${icoPath}`);
  console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
  
  // ICO 文件应该至少 50KB（包含多个尺寸）
  if (stats.size < 50 * 1024) {
    console.warn('⚠️  警告: ICO 文件可能只包含单一尺寸');
    console.warn('   建议使用在线工具重新生成包含多尺寸的 ICO 文件\n');
  } else {
    console.log('   ✓ 文件大小正常，应该包含多个尺寸\n');
  }
} else {
  console.error('❌ ICO 文件不存在:', icoPath);
  hasErrors = true;
}

// 3. 检查 package.json 配置
const packageJsonPath = path.join(__dirname, '../package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  console.log('📦 检查 package.json 配置:');
  
  // 检查 win.icon
  if (packageJson.build?.win?.icon) {
    const iconPath = packageJson.build.win.icon;
    console.log(`✅ win.icon: ${iconPath}`);
    
    if (!iconPath.endsWith('.ico')) {
      console.warn('⚠️  警告: Windows 建议使用 .ico 格式');
    }
  } else {
    console.error('❌ 缺少 build.win.icon 配置');
    hasErrors = true;
  }
  
  // 检查 NSIS 配置
  if (packageJson.build?.nsis) {
    const nsis = packageJson.build.nsis;
    console.log(`✅ nsis.installerIcon: ${nsis.installerIcon || '未设置'}`);
    console.log(`✅ nsis.uninstallerIcon: ${nsis.uninstallerIcon || '未设置'}`);
    console.log(`✅ nsis.installerHeaderIcon: ${nsis.installerHeaderIcon || '未设置'}`);
    
    if (nsis.include) {
      console.log(`✅ nsis.include: ${nsis.include}`);
      
      // 检查 NSIS 脚本是否存在
      const nsisScriptPath = path.join(__dirname, '..', nsis.include);
      if (fs.existsSync(nsisScriptPath)) {
        console.log('   ✓ NSIS 脚本文件存在');
      } else {
        console.error('   ❌ NSIS 脚本文件不存在:', nsisScriptPath);
        hasErrors = true;
      }
    }
  } else {
    console.warn('⚠️  警告: 缺少 NSIS 配置');
  }
  
  // 检查 extraResources
  if (packageJson.build?.extraResources) {
    console.log('✅ extraResources 已配置');
  } else {
    console.warn('⚠️  警告: 缺少 extraResources 配置，图标可能无法正确复制到打包应用');
  }
  
  console.log();
} else {
  console.error('❌ package.json 不存在');
  hasErrors = true;
}

// 4. 检查主进程代码
const mainIndexPath = path.join(__dirname, '../src/main/index.ts');
if (fs.existsSync(mainIndexPath)) {
  const mainIndexContent = fs.readFileSync(mainIndexPath, 'utf8');
  
  console.log('🔧 检查主进程代码:');
  
  if (mainIndexContent.includes('app.isPackaged')) {
    console.log('✅ 包含环境检测 (app.isPackaged)');
  } else {
    console.warn('⚠️  警告: 缺少环境检测，可能导致打包后路径错误');
  }
  
  if (mainIndexContent.includes('process.resourcesPath')) {
    console.log('✅ 使用 process.resourcesPath 处理生产环境路径');
  } else {
    console.warn('⚠️  警告: 缺少 process.resourcesPath，打包后可能找不到图标');
  }
  
  if (mainIndexContent.includes('.ico')) {
    console.log('✅ 使用 .ico 格式图标');
  } else {
    console.warn('⚠️  警告: 未使用 .ico 格式，Windows 兼容性可能不佳');
  }
  
  console.log();
}

// 总结
console.log('═'.repeat(60));
if (hasErrors) {
  console.error('❌ 验证失败: 发现错误，请修复后重试');
  process.exit(1);
} else {
  console.log('✅ 验证通过: 图标配置正确');
  console.log('\n📝 下一步:');
  console.log('   1. 运行 npm run build 构建应用');
  console.log('   2. 运行 npm run package:win 打包应用');
  console.log('   3. 卸载旧版本应用');
  console.log('   4. 安装新版本应用');
  console.log('   5. 重启电脑以清理图标缓存');
  process.exit(0);
}
