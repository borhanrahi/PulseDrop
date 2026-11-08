const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Error: No version provided to bump-version.cjs');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

// 1. package.json
const pkgPath = path.join(rootDir, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Updated package.json to ${version}`);
}

// 2. src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
  const tauri = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauri.version = version;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauri, null, 2) + '\n');
  console.log(`Updated tauri.conf.json to ${version}`);
}

// 3. src-tauri/Cargo.toml
const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^version = \".*\"/m, `version = "${version}"`);
  fs.writeFileSync(cargoPath, cargo);
  console.log(`Updated Cargo.toml to ${version}`);
}

// 4. Android tauri.properties if exists
const androidPropPath = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'tauri.properties');
if (fs.existsSync(androidPropPath)) {
  let props = fs.readFileSync(androidPropPath, 'utf8');
  props = props.replace(/^tauri\.android\.versionName=.*$/m, `tauri.android.versionName=${version}`);
  fs.writeFileSync(androidPropPath, props);
}
