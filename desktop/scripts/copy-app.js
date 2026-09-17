#!/usr/bin/env node
'use strict';
/* Copia los ficheros estáticos de la app (raíz del repositorio) a
   desktop/app/ para que electron-builder los pueda empaquetar. NO modifica
   nada del proyecto original: solo los lee y los duplica en una carpeta que
   ni siquiera se sube al repositorio (ver desktop/.gitignore).
   En modo desarrollo (npm start) esta copia no es necesaria: main.js sirve
   directamente index.html desde la raíz del repositorio. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP_DIR = path.join(__dirname, '..', 'app');

const FILES = ['index.html', 'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon.ico'];

fs.mkdirSync(APP_DIR, { recursive: true });
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.warn(`⚠ ${f} no existe en la raíz del proyecto, se omite`); continue; }
  fs.copyFileSync(src, path.join(APP_DIR, f));
  console.log(`✓ ${f}`);
}
