/**
 * Convert SVG icons to PNG for Chrome extension
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const iconsDir = path.join(__dirname, '..', 'icons');

const sizes = [16, 48, 128];

async function convertIcons() {
  for (const size of sizes) {
    const svgPath = path.join(iconsDir, `icon${size}.svg`);
    const pngPath = path.join(iconsDir, `icon${size}.png`);
    
    if (!fs.existsSync(svgPath)) {
      console.log(`SVG not found: ${svgPath}`);
      continue;
    }
    
    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(pngPath);
      
      console.log(`Created: icon${size}.png`);
    } catch (err) {
      console.error(`Failed to convert icon${size}.svg:`, err.message);
    }
  }
  
  console.log('Done!');
}

convertIcons();
