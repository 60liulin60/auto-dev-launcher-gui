/**
 * 生成高质量的 ICO 文件
 * 从 PNG 源文件生成包含多个尺寸的 ICO 文件
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const PNG_SOURCE = path.join(__dirname, '../build/icon.png');
const ICO_OUTPUT = path.join(__dirname, '../build/icon.ico');
const TEMP_DIR = path.join(__dirname, '../build/temp');

// 需要生成的图标尺寸
const SIZES = [16, 32, 48, 64, 128, 256];

async function generateIcon() {
  console.log('🎨 开始生成 ICO 文件...\n');

  // 1. 检查源文件
  if (!fs.existsSync(PNG_SOURCE)) {
    console.error('❌ 错误: PNG 源文件不存在:', PNG_SOURCE);
    process.exit(1);
  }

  console.log('✅ 找到 PNG 源文件:', PNG_SOURCE);

  // 2. 创建临时目录
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  try {
    // 3. 生成各种尺寸的 PNG 文件
    console.log('\n📐 生成各种尺寸的图标...');
    const pngFiles = [];

    for (const size of SIZES) {
      const outputPath = path.join(TEMP_DIR, `icon-${size}.png`);
      
      await sharp(PNG_SOURCE)
        .resize(size, size, {
          kernel: 'lanczos3',
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      pngFiles.push(outputPath);
      console.log(`  ✓ 生成 ${size}x${size} 图标`);
    }

    // 4. 将所有 PNG 合并为 ICO 文件
    console.log('\n🔨 合并为 ICO 文件...');
    const icoBuffer = await pngToIco(pngFiles);
    fs.writeFileSync(ICO_OUTPUT, icoBuffer);

    // 5. 验证生成的 ICO 文件
    const stats = fs.statSync(ICO_OUTPUT);
    console.log('\n✅ ICO 文件生成成功!');
    console.log(`   路径: ${ICO_OUTPUT}`);
    console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   包含尺寸: ${SIZES.join(', ')}`);

    // 6. 清理临时文件
    console.log('\n🧹 清理临时文件...');
    for (const file of pngFiles) {
      fs.unlinkSync(file);
    }
    fs.rmdirSync(TEMP_DIR);
    console.log('   ✓ 临时文件已清理');

    console.log('\n🎉 完成! 现在可以重新打包应用了。');
    console.log('   运行: npm run package:win');

  } catch (error) {
    console.error('\n❌ 生成 ICO 文件时出错:', error.message);
    
    // 清理临时文件
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEMP_DIR, file));
      }
      fs.rmdirSync(TEMP_DIR);
    }
    
    process.exit(1);
  }
}

// 运行生成脚本
generateIcon();
