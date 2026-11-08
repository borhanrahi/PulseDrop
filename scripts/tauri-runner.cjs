const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const home = os.homedir();
const cargoBin = path.join(home, '.cargo', 'bin');
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

const envPath = process.env.PATH || '';
const pathSeparator = path.delimiter;
const newPath = [cargoBin, mingwBin, envPath].join(pathSeparator);

const args = process.argv.slice(2);
const tauriCmd = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri');

const child = spawn(tauriCmd, args, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PATH: newPath,
    CARGO: path.join(cargoBin, 'cargo.exe'),
    RUSTC: path.join(cargoBin, 'rustc.exe'),
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
