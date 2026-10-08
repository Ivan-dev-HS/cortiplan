'use strict';
/* CortiPlan – envoltorio de escritorio (Electron).
   No modifica index.html en absoluto: lo sirve tal cual (desde la raíz del
   repositorio en desarrollo, o desde app/ ya empaquetado) mediante un
   pequeño servidor HTTP local, e intercepta las peticiones a las librerías
   que la app pide por CDN (pdf.js, pdf-lib) para servirlas desde copias
   locales — así funciona sin conexión a internet.

   Tesseract.js (el OCR de respaldo para PDFs escaneados/imágenes) se deja
   sin interceptar: sigue pidiéndose a unpkg.com como en el navegador. Si el
   ordenador del cliente no tiene internet en ese momento, el reconocimiento
   de texto normal de PDF sigue funcionando igual (no depende de Tesseract);
   solo el OCR de imágenes/PDFs escaneados no estará disponible sin conexión. */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PACKAGED_APP_DIR = path.join(__dirname, 'app');
const DEV_APP_DIR = path.join(__dirname, '..');
const APP_DIR = fs.existsSync(path.join(PACKAGED_APP_DIR, 'index.html')) ? PACKAGED_APP_DIR : DEV_APP_DIR;
const VENDOR_DIR = path.join(__dirname, 'vendor');
const ICON_PATH = fs.existsSync(path.join(APP_DIR, 'icon.ico')) ? path.join(APP_DIR, 'icon.ico') : undefined;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.css': 'text/css',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

// Sirve la app (raíz del proyecto o app/ empaquetado) y las libs vendorizadas
// bajo /vendor/, todo desde localhost — necesario para que el Service Worker
// de la app pueda registrarse (no lo permite un origen file://).
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const base = urlPath.startsWith('/vendor/') ? VENDOR_DIR : APP_DIR;
      const rel = urlPath.startsWith('/vendor/') ? urlPath.slice('/vendor/'.length) : (urlPath === '/' ? 'index.html' : urlPath.slice(1));
      const filePath = path.join(base, rel);
      if (!filePath.startsWith(base)) { res.writeHead(403); res.end(); return; }
      serveFile(res, filePath);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function vendorRedirects(port) {
  const v = (f) => `http://127.0.0.1:${port}/vendor/${f}`;
  return {
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': v('pdf.min.js'),
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js': v('pdf.worker.min.js'),
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js': v('pdf-lib.min.js'),
    'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js': v('pdf-lib.min.js'),
  };
}

let mainWindow;

async function createWindow() {
  const port = await startServer();
  const redirects = vendorRedirects(port);

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const redirectURL = redirects[details.url];
    callback(redirectURL ? { redirectURL } : {});
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
