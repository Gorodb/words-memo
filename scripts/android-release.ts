/// <reference types="node" />
/**
 * Builds release APKs (JS bundled inside, no Metro needed), one per phone ABI,
 * and copies them to dist/words-memo-<versionName>-<abi>.apk.
 * Run: `npm run android:release` (extra Gradle args after `--`).
 * Signing: see the WORDS_UPLOAD_* note in android/app/build.gradle.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const OUTPUT = path.join(ANDROID, 'app/build/outputs/apk/release');
const ABI_NAMES: Record<string, string> = {
  'arm64-v8a': 'arm64',
  'armeabi-v7a': 'armv7',
};

// Stale APKs (e.g. a previous universal build) would otherwise be copied too.
fs.rmSync(OUTPUT, { recursive: true, force: true });

const gradleArgs = ['assembleRelease', ...process.argv.slice(2)];
// Windows: .bat files need a shell; pass one command string (absolute path,
// since Windows may not look up commands in the current directory).
const result =
  process.platform === 'win32'
    ? spawnSync(
        [`"${path.join(ANDROID, 'gradlew.bat')}"`, ...gradleArgs].join(' '),
        { cwd: ANDROID, stdio: 'inherit', shell: true },
      )
    : spawnSync(path.join(ANDROID, 'gradlew'), gradleArgs, {
        cwd: ANDROID,
        stdio: 'inherit',
      });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const gradle = fs.readFileSync(path.join(ANDROID, 'app/build.gradle'), 'utf8');
const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? 'unknown';
const dist = path.join(ROOT, 'dist');
fs.mkdirSync(dist, { recursive: true });

// app-<abi>-release.apk with ABI splits, app-release.apk without.
const apks = fs
  .readdirSync(OUTPUT)
  .filter(file => /^app-(.+-)?release\.apk$/.test(file));
if (apks.length === 0) {
  console.error(`No release APK found in ${OUTPUT}`);
  process.exit(1);
}
console.log('');
for (const file of apks) {
  const abi = file.match(/^app-(.+)-release\.apk$/)?.[1];
  const suffix = abi ? `-${ABI_NAMES[abi] ?? abi}` : '';
  const target = path.join(dist, `words-memo-${version}${suffix}.apk`);
  fs.copyFileSync(path.join(OUTPUT, file), target);
  const sizeMB = (fs.statSync(target).size / 1e6).toFixed(1);
  console.log(`Release APK: ${path.relative(ROOT, target)} (${sizeMB} MB)`);
}
