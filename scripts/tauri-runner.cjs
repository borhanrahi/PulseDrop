const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const env = { ...process.env };
const pathParts = [];

// Only apply local Windows MinGW and GNU paths when running on local machine, NOT in CI
if (process.platform === 'win32' && !process.env.CI) {
  const home = os.homedir();
  const customCargoBin = path.join(home, '.cargo', 'bin');
  const mingwBin = path.join(
    home,
    'AppData',
    'Local',
    'Microsoft',
    'WinGet',
    'Packages',
    'BrechtSanders.WinLibs.POSIX.MSVCRT_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'mingw64',
    'bin'
  );

  if (fs.existsSync(mingwBin)) {
    pathParts.push(mingwBin);
  }
  if (fs.existsSync(customCargoBin)) {
    pathParts.push(customCargoBin);
    const cargoExe = path.join(customCargoBin, 'cargo.exe');
    const rustcExe = path.join(customCargoBin, 'rustc.exe');
    if (fs.existsSync(cargoExe)) {
      env.CARGO = cargoExe;
    }
    if (fs.existsSync(rustcExe)) {
      env.RUSTC = rustcExe;
    }
    env.RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu';
  }
}

if (pathParts.length > 0) {
  env.PATH = [...pathParts, env.PATH || ''].join(path.delimiter);
}

const args = process.argv.slice(2);
const binName = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const localTauriCmd = path.join(__dirname, '..', 'node_modules', '.bin', binName);
const execCmd = fs.existsSync(localTauriCmd) ? localTauriCmd : (process.platform === 'win32' ? 'tauri.cmd' : 'tauri');

const child = spawn(execCmd, args, {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
