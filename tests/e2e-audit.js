#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   Tests E2E (navegador real, con Playwright) de la auditoría de CortiPlan.
   Complementan a tests/run-parser-tests.js (que son tests unitarios puros,
   sin navegador): aquí se abre la app de verdad en Chromium, se interactúa
   con ella como lo haría una persona, y se comprueba lo que ve en pantalla.

   Qué cubre cada bloque:
   1. Flujo real: subir un PDF, generar la ficha de instalador y la hoja de
      corte, y comprobar que los datos que aparecen son los esperados.
   2. Seguridad XSS: meter payloads típicos en los campos de texto libre
      (nombre, dirección, notas, estancia, tejido) y comprobar que NINGUNO
      llega a ejecutarse ni a crear elementos vivos en el DOM.
   3. Resiliencia: simular que el CDN de pdf.js está bloqueado (sin
      conexión / cortafuegos / bloqueador de anuncios) y comprobar que la
      app sigue arrancando entera y avisa con un mensaje claro, en vez de
      quedarse muerta sin más (el bug crítico real que encontró esta
      auditoría — ver el informe).
   4. Viewport móvil: la interfaz se mantiene usable en un tamaño de
      pantalla de móvil real.

   Requisitos (no van en el index.html de producción — son solo
   herramientas de desarrollo para poder ejecutar estos tests):
     npm install --save-dev playwright pdf-lib
     npx playwright install chromium      (solo la primera vez)

   Uso:
     node tests/e2e-audit.js

   Sale con código 1 si algo falla. No necesita conexión a Internet salvo
   la primera vez que se instala Playwright/los navegadores. ═══════════ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8933;

let pass = 0, fail = 0;
function ok(name) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
function bad(name, err) {
  fail++;
  console.log('  \x1b[31m✗\x1b[0m ' + name);
  console.log('    ' + (err && err.message ? err.message : err));
}
async function test(name, fn) {
  try { await fn(); ok(name); }
  catch (err) { bad(name, err); }
}

function startServer() {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(res => server.listen(PORT, () => res(server)));
}

// Genera un PDF sintético con el mismo formato de texto que un presupuesto
// real de Canotex (misma línea usada en tests/samples.js, "Onda Perfecta
// (CORTOP)"), para no depender de ningún PDF concreto de ningún cliente.
async function buildSamplePDF(pdfLib) {
  const { PDFDocument, StandardFonts } = pdfLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const lines = [
    'PRESUPUESTO DE VENTA',
    'REF. A691 CLIENTE PRUEBA',
    'ARTICULO DESCRIPCION CANTIDAD PRECIO',
    'COMEDOR 1,00',
    'CORTOP MEDIDA:150X250H CONFE:1 HOJAS RECOG:D COLOR GUIA:BCO',
    'UD. CONFECCION ONDA PERFECTA (ONDA 8CM)',
    'TEJIDO: SAURA C/02',
    'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA, REFORZADA',
  ];
  let y = 780;
  for (const line of lines) { page.drawText(line, { x: 50, y, size: 10, font }); y -= 16; }
  return Buffer.from(await doc.save());
}

(async () => {
  const { chromium } = require('playwright');
  const server = await startServer();
  const browser = await chromium.launch();

  console.log('\n1) Flujo real: subir PDF -> ficha de instalador + hoja de corte');
  await test('Un PDF sintético con el formato real de Canotex genera la ficha con los datos correctos', async () => {
    const pdfLib = require('pdf-lib');
    const pdfBytes = await buildSamplePDF(pdfLib);
    const tmpPdf = path.join(require('os').tmpdir(), 'cortiplan-e2e-sample.pdf');
    fs.writeFileSync(tmpPdf, pdfBytes);

    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    try {
      await page.addInitScript(() => {
        if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('disabled for test'));
      });
      // pdf.js no se puede descargar del cdnjs real en todos los entornos
      // (p.ej. un sandbox de CI sin salida a Internet): si hay una copia
      // local de pdfjs-dist, se sirve desde ahí (node_modules del proyecto,
      // o la carpeta que indique CORTIPLAN_PDFJS_VENDOR_DIR); si no, se deja
      // pasar al cdnjs real (lo normal al ejecutar esto con conexión).
      const localPdfjs = process.env.CORTIPLAN_PDFJS_VENDOR_DIR || path.join(ROOT, 'node_modules', 'pdfjs-dist', 'build');
      if (fs.existsSync(path.join(localPdfjs, 'pdf.min.js'))) {
        await page.route('**cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', r =>
          r.fulfill({ path: path.join(localPdfjs, 'pdf.min.js'), contentType: 'application/javascript' }));
        await page.route('**cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', r =>
          r.fulfill({ path: path.join(localPdfjs, 'pdf.worker.min.js'), contentType: 'application/javascript' }));
      }
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.waitForTimeout(400);
      await page.setInputFiles('#fileInput', tmpPdf);
      await page.waitForTimeout(2500);

      const cards = await page.evaluate(() => [...document.querySelectorAll('#pcards .pcard')].map(c => ({
        estancia: c.querySelector('.est')?.textContent || null,
        ancho: c.querySelector('input[onchange*="\'ancho\'"]')?.value || null,
        alto: c.querySelector('input[onchange*="\'alto\'"]')?.value || null,
      })));
      if (cards.length !== 1) throw new Error('Se esperaba 1 ficha, se detectaron ' + cards.length);
      if (cards[0].estancia !== 'COMEDOR') throw new Error('Estancia esperada "COMEDOR", salió "' + cards[0].estancia + '"');
      if (cards[0].ancho !== '150' || cards[0].alto !== '250') throw new Error('Medida esperada 150x250, salió ' + cards[0].ancho + 'x' + cards[0].alto);
    } finally {
      await page.close();
      fs.unlinkSync(tmpPdf);
    }
  });

  console.log('\n2) Seguridad: payloads XSS en campos de texto libre');
  const PAYLOADS = [
    '<script>window.__xssProbe && window.__xssProbe()</script>',
    '"><img src=x onerror="window.__xssProbe && window.__xssProbe()">',
    "'><svg onload=\"window.__xssProbe && window.__xssProbe()\">",
  ];
  await test('Ningún payload XSS en Nombre/Dirección/Notas del cliente llega a ejecutarse', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    try {
      let fired = false;
      await page.exposeFunction('__xssProbe', () => { fired = true; });
      await page.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('x')); });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.waitForTimeout(300);
      await page.check('#cliCheck').catch(() => {});
      for (const [id, payload] of [['cnom', PAYLOADS[0]], ['cdir', PAYLOADS[1]], ['notas', PAYLOADS[2]]]) {
        await page.fill('#' + id, payload);
        await page.dispatchEvent('#' + id, 'input');
      }
      await page.waitForTimeout(900);
      const liveScripts = await page.locator('#main script').count();
      const liveImgs = await page.locator('#main img').count();
      if (fired) throw new Error('¡Un payload XSS llegó a ejecutarse!');
      if (liveScripts > 0) throw new Error('Hay ' + liveScripts + ' <script> reales dentro de #main');
      if (liveImgs > 0) throw new Error('Hay ' + liveImgs + ' <img> reales inyectados dentro de #main');
    } finally { await page.close(); }
  });
  await test('Un payload XSS en Estancia/Tejido de una cortina tampoco se ejecuta', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    try {
      let fired = false;
      await page.exposeFunction('__xssProbe', () => { fired = true; });
      await page.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('x')); });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.waitForTimeout(500);
      const estancia = page.locator('#pcards input[onchange*="\'estancia\'"]').first();
      await estancia.fill(PAYLOADS[0]);
      await estancia.dispatchEvent('change');
      const tejido = page.locator('#pcards input[onchange*="\'tejido\'"]').first();
      await tejido.fill(PAYLOADS[1]);
      await tejido.dispatchEvent('change');
      await page.waitForTimeout(900);
      if (fired) throw new Error('¡Un payload XSS llegó a ejecutarse!');
    } finally { await page.close(); }
  });

  console.log('\n3) Resiliencia: CDN de pdf.js bloqueado (sin conexión / cortafuegos)');
  await test('Con pdf.js bloqueado, la app arranca entera (no se queda muerta) y avisa con un mensaje claro', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    try {
      await page.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('x')); });
      await page.route('**cdnjs.cloudflare.com/**', r => r.abort());
      await page.route('**unpkg.com/**', r => r.abort());
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.waitForTimeout(500);
      const cardCount = await page.locator('#pcards .pcard').count();
      if (cardCount < 1) throw new Error('La app no terminó de inicializarse (0 fichas iniciales) con pdf.js bloqueado');
      // No hace falta un PDF real: basta con que fileInput tenga algo para
      // disparar handleFile() y comprobar que el error queda visible.
      const tmpTxt = path.join(require('os').tmpdir(), 'cortiplan-e2e-fake.pdf');
      fs.writeFileSync(tmpTxt, 'no es un pdf de verdad, solo dispara handleFile()');
      await page.setInputFiles('#fileInput', tmpTxt);
      await page.waitForTimeout(1200);
      fs.unlinkSync(tmpTxt);
      const status = await page.evaluate(() => document.getElementById('stTxt')?.textContent || '');
      const dotCls = await page.evaluate(() => document.getElementById('dot')?.className || '');
      if (!/pdfjsLib|error/i.test(status)) throw new Error('No se mostró ningún mensaje de error claro; estado: "' + status + '"');
      if (!dotCls.includes('er')) throw new Error('El indicador de estado no se puso en modo error (clase: "' + dotCls + '")');
    } finally { await page.close(); }
  });

  console.log('\n4) Viewport móvil');
  await test('La interfaz es usable en un tamaño de pantalla de móvil (390x844, iPhone 12)', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('x')); });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.waitForTimeout(400);
      const fileInputVisible = await page.locator('#fileInput, #upzone').first().isVisible();
      if (!fileInputVisible) throw new Error('La zona de subir archivo no es visible/usable en móvil');
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      if (overflowX) throw new Error('Hay scroll horizontal en móvil (algo se sale del ancho de pantalla)');
    } finally { await page.close(); }
  });

  await browser.close();
  server.close();

  console.log(`\n${pass} OK, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('Fallo al ejecutar los tests E2E:', err); process.exit(1); });
