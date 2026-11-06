/// <reference types="node" />
/**
 * Generates launcher icons (Android legacy + adaptive, iOS) and the splash
 * logo from artwork.ts. Run: `npm run brand` (then the bootsplash step it prints).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { backgroundSvg, BRAND, iconSvg, markSvg } from './artwork.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const IOS_ICONS = path.join(
  ROOT,
  'ios/wordsLearning/Images.xcassets/AppIcon.appiconset',
);
const BRAND_DIR = path.join(ROOT, 'assets/brand');

/** Android density buckets → scale factor (mdpi = 1). */
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const LEGACY_DP = 48;
const ADAPTIVE_DP = 108;
/** Mark size inside the 108dp adaptive canvas (safe zone is 66dp ≈ 61%). */
const ADAPTIVE_MARK_SCALE = 0.6;

const render = (svg: string, size: number) =>
  sharp(Buffer.from(svg)).resize(size, size).png();

const maskSvg = (size: number, shape: 'squircle' | 'circle') =>
  Buffer.from(
    shape === 'circle'
      ? `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
      : `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#fff"/></svg>`,
  );

async function masked(
  svg: string,
  size: number,
  shape: 'squircle' | 'circle',
  file: string,
) {
  const image = await render(svg, size).toBuffer();
  await sharp(image)
    .composite([{ input: maskSvg(size, shape), blend: 'dest-in' }])
    .png()
    .toFile(file);
}

async function android() {
  for (const [density, factor] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const legacy = Math.round(LEGACY_DP * factor);
    const adaptive = Math.round(ADAPTIVE_DP * factor);
    // Pre-Android 8 launchers: pre-masked icons.
    await masked(iconSvg(1024), legacy, 'squircle', path.join(dir, 'ic_launcher.png'));
    await masked(iconSvg(1024), legacy, 'circle', path.join(dir, 'ic_launcher_round.png'));
    // Android 8+: adaptive layers (the launcher applies its own mask).
    await render(backgroundSvg(1024), adaptive).toFile(
      path.join(dir, 'ic_launcher_background.png'),
    );
    await render(markSvg(1024, ADAPTIVE_MARK_SCALE), adaptive).toFile(
      path.join(dir, 'ic_launcher_foreground.png'),
    );
  }
  const anydpi = path.join(RES, 'mipmap-anydpi-v26');
  fs.mkdirSync(anydpi, { recursive: true });
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adaptiveXml);
  fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adaptiveXml);
}

async function ios() {
  // Xcode 14+: one 1024 px icon; iOS applies the corner mask. No alpha allowed.
  for (const file of fs.readdirSync(IOS_ICONS)) {
    if (file.endsWith('.png')) {
      fs.rmSync(path.join(IOS_ICONS, file));
    }
  }
  await render(iconSvg(1024), 1024)
    .flatten({ background: BRAND.gradientStart })
    .toFile(path.join(IOS_ICONS, 'AppIcon-1024.png'));
  fs.writeFileSync(
    path.join(IOS_ICONS, 'Contents.json'),
    JSON.stringify(
      {
        images: [
          {
            filename: 'AppIcon-1024.png',
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024',
          },
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2,
    ) + '\n',
  );
}

async function sources() {
  fs.mkdirSync(BRAND_DIR, { recursive: true });
  fs.writeFileSync(path.join(BRAND_DIR, 'icon.svg'), iconSvg(1024));
  // Splash logo: the mark filling its canvas (bootsplash sizes it).
  fs.writeFileSync(path.join(BRAND_DIR, 'splash-logo.svg'), markSvg(1024, 1));
  await render(iconSvg(1024), 1024).toFile(path.join(BRAND_DIR, 'icon-1024.png'));
}

await android();
await ios();
await sources();
console.log('Icons generated. Splash screen:');
console.log(
  `  npx react-native-bootsplash generate assets/brand/splash-logo.svg --platforms=android,ios --background=${BRAND.splashBackground} --logo-width=160`,
);
