const { app, BrowserWindow, Tray, Menu, screen, ipcMain } = require('electron');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');

let mainWindow;
let tray;
let isShiftDown = false;
let otherKeyPressed = false;

app.disableHardwareAcceleration(); 

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 300,
    height: 300,
    x: width - 350,
    y: height - 350,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // 【关键】默认是“不可聚焦”，保证你打字时不干扰
    focusable: false, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
}

// === 动态焦点控制 (解决输入框点不动的问题) ===
ipcMain.on('enter-settings-mode', () => {
    if(mainWindow) {
        mainWindow.setFocusable(true); // 允许聚焦
        mainWindow.focus(); // 强制聚焦，方便直接打字
    }
});

ipcMain.on('exit-settings-mode', () => {
    if(mainWindow) {
        mainWindow.blur(); // 失去焦点
        mainWindow.setFocusable(false); // 变回“鬼魂”状态，不抢焦点
    }
});

function startKeyboardListener() {
  uIOhook.on('keydown', (e) => {
    if (e.keycode === 42 || e.keycode === 54) {
      isShiftDown = true;
      otherKeyPressed = false;
    } else {
      if (isShiftDown) otherKeyPressed = true;
    }
  });

  uIOhook.on('keyup', (e) => {
    if (e.keycode === 42 || e.keycode === 54) {
      isShiftDown = false;
      if (!otherKeyPressed) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('global-shift-pressed');
        }
      }
    }
  });
  uIOhook.start();
}

app.whenReady().then(() => {
  createWindow();
  startKeyboardListener();

  try { tray = new Tray(path.join(__dirname, 'icon.png')); } catch (e) { 
      try { tray = new Tray(path.join(__dirname, 'package.json')); } catch (e) {} 
  }
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '退出 ZenIME', click: () => { uIOhook.stop(); app.quit(); } }
  ]);
  if(tray) {
      tray.setToolTip('ZenIME');
      tray.setContextMenu(contextMenu);
  }
});

app.on('window-all-closed', () => {
  uIOhook.stop();
  if (process.platform !== 'darwin') app.quit();
});