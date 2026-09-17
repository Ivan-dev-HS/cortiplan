#!/usr/bin/env node
'use strict';
/* Copia a desktop/vendor/ las mismas versiones exactas de pdf.js y pdf-lib
   que index.html pide por CDN (cdnjs.cloudflare.com), tomándolas de los
   paquetes npm ya instalados como devDependencies. Así la app de escritorio
   funciona sin conexión a internet, sin tener que subir esos binarios al
   repositorio: se resuelven en el momento del build, igual que cualquier
   otra dependencia. */

const fs = require('fs');
const path = require('path');

const VENDOR_DIR = path.join(__dirname, '..', 'vendor');
fs.mkdirSync(VENDOR_DIR, { recursive: true });

const FILES = [
  { from: ['pdfjs-dist', 'build', 'pdf.min.js'], to: 'pdf.min.js' },
  { from: ['pdfjs-dist', 'build', 'pdf.worker.min.js'], to: 'pdf.worker.min.js' },
  { from: ['pdf-lib', 'dist', 'pdf-lib.min.js'], to: 'pdf-lib.min.js' },
];

const NODE_MODULES = path.join(__dirname, '..', 'node_modules');

for (const f of FILES) {
  const src = path.join(NODE_MODULES, ...f.from);
  const dest = path.join(VENDOR_DIR, f.to);
  if (!fs.existsSync(src)) {
    console.error(`✗ No se encuentra ${src} — ¿has ejecutado "npm install" dentro de desktop/?`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`✓ ${f.to}`);
}
