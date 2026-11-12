// Copies Cesium's static runtime files into public/cesium (pitfall 1 in the plan).
// Runs on postinstall, predev and prebuild; skips the copy when the installed
// Cesium version already matches the stamp.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const require = createRequire(path.join(appRoot, 'package.json'));

const cesiumPkg = require.resolve('cesium/package.json');
const version = JSON.parse(readFileSync(cesiumPkg, 'utf8')).version;
const src = path.join(path.dirname(cesiumPkg), 'Build', 'Cesium');
const dest = path.join(appRoot, 'public', 'cesium');
const stamp = path.join(dest, '.version');

if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === version) {
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  cpSync(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
writeFileSync(stamp, `${version}\n`);
console.log(`copy-cesium: copied Cesium ${version} assets to public/cesium`);
