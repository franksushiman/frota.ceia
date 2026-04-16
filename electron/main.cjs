'use strict';
const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
const PORT = 3000;
let serverProcess = null;
let mainWindow = null;

const logFile = path.join(require('os').homedir(), 'ceia_crash.log');

function findNodeBin() {
    if (process.env.CEIA_NODE_BIN) return process.env.CEIA_NODE_BIN;

    const os = require('os');
    const home = os.homedir();
    const isWin = process.platform === 'win32';

    if (isWin) {
        const candidates = [
            // instalação padrão do Node no Windows
            'C:\\Program Files\\nodejs\\node.exe',
            'C:\\Program Files (x86)\\nodejs\\node.exe',
            // nvm-windows: symlink padrão
            path.join(process.env.APPDATA || '', 'nvm', 'nodejs', 'node.exe'),
            path.join(process.env.NVM_SYMLINK || 'C:\\Program Files\\nodejs', 'node.exe'),
            // volta para PATH via where
        ];
        for (const c of candidates) {
            try { if (fs.existsSync(c)) return c; } catch (_) {}
        }
        try {
            const { execSync } = require('child_process');
            return execSync('where node', { encoding: 'utf8', shell: 'cmd.exe' }).trim().split('\r\n')[0];
        } catch (_) {}
        return 'node.exe';
    }

    const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm');
    const candidates = [
        '/usr/bin/node',
        '/usr/local/bin/node',
        '/opt/homebrew/bin/node',           // Mac Apple Silicon (Homebrew)
        '/usr/local/opt/node/bin/node',      // Mac Intel (Homebrew cellar)
        path.join(home, '.local', 'bin', 'node'),
    ];

    // NVM alias default (mais confiável — aponta direto para a versão ativa)
    try {
        const alias = fs.readFileSync(path.join(nvmDir, 'alias', 'default'), 'utf8').trim();
        const resolved = fs.readlinkSync
            ? path.join(nvmDir, 'versions', 'node', alias, 'bin', 'node')
            : null;
        if (resolved) candidates.unshift(resolved);
    } catch (_) {}

    // NVM: todas as versões instaladas (mais recente primeiro)
    try {
        const versions = fs.readdirSync(path.join(nvmDir, 'versions', 'node')).reverse();
        for (const v of versions)
            candidates.push(path.join(nvmDir, 'versions', 'node', v, 'bin', 'node'));
    } catch (_) {}

    for (const c of candidates) {
        try { if (fs.existsSync(c)) return c; } catch (_) {}
    }

    try {
        const { execSync } = require('child_process');
        return execSync('which node', { encoding: 'utf8' }).trim();
    } catch (_) {}

    return 'node';
}

function getUserDataPaths() {
    const userData = app.getPath('userData');
    return {
        dbPath: path.join(userData, 'database.sqlite'),
        authPath: path.join(userData, 'auth_info_baileys'),
        envPath: path.join(userData, '.env'),
    };
}

function copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d);
    }
}

function ensureUserData() {
    const { dbPath, authPath } = getUserDataPaths();
    const appRoot = isDev ? path.join(__dirname, '..') : app.getAppPath();
    if (!fs.existsSync(dbPath)) {
        const src = path.join(appRoot, 'database.sqlite');
        if (fs.existsSync(src)) fs.copyFileSync(src, dbPath);
    }
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
        const src = path.join(appRoot, 'auth_info_baileys');
        if (fs.existsSync(src)) copyDirSync(src, authPath);
    }
}

function startServer() {
    try {
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
            execSync('for /f "tokens=5" %a in (\'netstat -ano ^| findstr :3000 ^| findstr LISTENING\') do taskkill /F /PID %a', { shell: 'cmd.exe', stdio: 'ignore' });
        } else if (process.platform === 'darwin') {
            execSync('lsof -ti:3000 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
        } else {
            execSync('fuser -k 3000/tcp 2>/dev/null || true', { stdio: 'ignore' });
        }
    } catch (_) {}

    const { dbPath, authPath, envPath } = getUserDataPaths();
    const appRoot = isDev ? path.join(__dirname, '..') : app.getAppPath();
    // spawn() é uma syscall nativa e não consegue acessar caminhos dentro do .asar.
    // Em produção, usamos app.asar.unpacked onde os arquivos existem no filesystem real.
    const spawnRoot = isDev ? appRoot : appRoot.replace('app.asar', 'app.asar.unpacked');
    const extraPaths = process.platform === 'win32'
        ? ['C:\\Program Files\\nodejs', path.join(process.env.APPDATA || '', 'nvm', 'nodejs')]
        : ['/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin', '/usr/local/opt/node/bin'];
    const envPATH = [...extraPaths, process.env.PATH || ''].join(path.delimiter);
    const env = { ...process.env, PATH: envPATH, DB_PATH: dbPath, AUTH_PATH: authPath, PORT: String(PORT) };

    let cmd, args;
    if (isDev) {
        cmd = path.join(appRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
        args = ['--env-file=' + path.join(appRoot, '.env'), path.join(appRoot, 'index.ts')];
    } else {
        cmd = findNodeBin();
        args = [path.join(spawnRoot, 'dist', 'server.cjs')];
        if (fs.existsSync(envPath)) args.unshift('--env-file=' + envPath);
    }

    fs.writeFileSync(logFile, '[' + new Date().toISOString() + '] CMD: ' + cmd + '\n[ARGS] ' + JSON.stringify(args) + '\n[CWD] ' + spawnRoot + '\n\n');

    serverProcess = spawn(cmd, args, { cwd: spawnRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
    serverProcess.stdout.on('data', data => { process.stdout.write('[CEIA] ' + data); fs.appendFileSync(logFile, data.toString()); });
    serverProcess.stderr.on('data', data => { process.stderr.write('[CEIA] ' + data); fs.appendFileSync(logFile, data.toString()); });
    serverProcess.on('exit', code => fs.appendFileSync(logFile, '\nExit code: ' + code));

    serverProcess.on('error', err => {
        dialog.showErrorBox('Erro ao iniciar', err.message);
        app.quit();
    });
}

function waitForServer(timeout = 45000) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeout;
        function check() {
            const req = http.get('http://localhost:' + PORT + '/auth/setup-needed', res => {
                res.resume(); resolve();
            });
            req.on('error', () => {
                if (Date.now() >= deadline) return reject(new Error('Timeout'));
                setTimeout(check, 600);
            });
            req.setTimeout(500, () => { req.destroy(); setTimeout(check, 600); });
        }
        check();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 800, minWidth: 900, minHeight: 600,
        title: 'CEIA - Gestão de Frota',
        backgroundColor: '#0f172a', show: false,
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, sandbox: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
    });

    if (!isDev && process.platform !== 'darwin') Menu.setApplicationMenu(null);

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
        cb({
            responseHeaders: Object.assign({}, details.responseHeaders, {
                'Content-Security-Policy': [
                    "default-src 'self' http://localhost:3000; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://maps.googleapis.com https://maps.gstatic.com; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com https://maps.googleapis.com; " +
                    "font-src 'self' https://fonts.gstatic.com; " +
                    "img-src * data: blob:; " +
                    "connect-src 'self' http://localhost:3000 ws://localhost:3000 wss: https:; " +
                    "frame-src https://www.google.com https://maps.google.com; " +
                    "worker-src 'self' blob:;"
                ]
            })
        });
    });

    mainWindow.loadURL('http://localhost:' + PORT);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('http://localhost:' + PORT)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });
}

app.whenReady().then(() => {
    ipcMain.handle('open-external', (_event, url) => {
        if (url && url.startsWith('http')) shell.openExternal(url);
    });

    ensureUserData();
    const { dbPath, authPath } = getUserDataPaths();
    process.env.DB_PATH   = dbPath;
    process.env.AUTH_PATH = authPath;
    startServer();
    waitForServer(120000).then(() => {
        createWindow();
        if (app.isPackaged) {
            try { autoUpdater.checkForUpdatesAndNotify(); } catch (_) {}
            autoUpdater.on('error', (err) => {
                if (!String(err).includes('404')) console.error('autoUpdater error:', err);
            });
            autoUpdater.on('update-available', () => {
                dialog.showMessageBox(mainWindow, {
                    type: 'info', title: 'Atualização disponível',
                    message: 'Nova versão do CEIA Frota disponível. Download em 2º plano.',
                    buttons: ['OK']
                });
            });
            autoUpdater.on('update-downloaded', () => {
                dialog.showMessageBox(mainWindow, {
                    type: 'info', title: 'Atualização pronta',
                    message: 'Atualização baixada. Reiniciar para instalar?',
                    buttons: ['Reiniciar agora', 'Mais tarde']
                }).then(result => { if (result.response === 0) autoUpdater.quitAndInstall(); });
            });
        }
    }).catch(() => {
        dialog.showErrorBox('Erro', 'Servidor não respondeu.');
        app.quit();
    });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Mac: recriar janela ao clicar no ícone do Dock com app já aberto
app.on('activate', () => { if (!mainWindow || mainWindow.isDestroyed()) createWindow(); });

app.on('will-quit', () => {
    if (serverProcess) {
        try {
            if (process.platform === 'win32') {
                require('child_process').execSync('taskkill /PID ' + serverProcess.pid + ' /T /F', { stdio: 'ignore' });
            } else {
                serverProcess.kill('SIGTERM');
                const execSync = require('child_process').execSync;
                process.platform === 'darwin' 
                    ? execSync('lsof -ti:3000 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' }) 
                    : execSync('fuser -k 3000/tcp 2>/dev/null || true', { stdio: 'ignore' });
            }
        } catch (_) {}
        serverProcess = null;
    }
});
