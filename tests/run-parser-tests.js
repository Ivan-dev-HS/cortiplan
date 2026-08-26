#!/usr/bin/env node
'use strict';
/* Tests de regresión del parser de presupuestos de CortiPlan.
   Carga las funciones reales de index.html (sin tocarlas ni duplicarlas)
   en un sandbox de Node con un DOM mínimo, y comprueba que un puñado de
   bloques de texto representativos se siguen extrayendo igual.

   Uso:  node tests/run-parser-tests.js
   Sale con código 1 si algo falla, para poder engancharlo a CI más adelante. */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { loadAppScript, extractMainScript } = require('./dom-stub.js');
const samples = require('./samples.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = loadAppScript(extractMainScript(html));

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (err) {
    fail++;
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + (err.message || err).toString().split('\n').join('\n    '));
  }
}

console.log('estrategiaCanotex — casos de presupuesto');
for (const s of samples) {
  test(s.name, () => {
    // El código de la app corre en un vm.context aparte (otro "realm"): sus
    // arrays/objetos no son == a los de este proceso aunque tengan los
    // mismos datos. Se comparan tras un JSON round-trip para quedarnos solo
    // con los valores, no con la identidad de los constructores.
    const out = JSON.parse(JSON.stringify(app.estrategiaCanotex(s.txt)));
    assert.deepStrictEqual(out, s.expected);
  });
}

console.log('\nFunciones puras del parser');

test('fmtCm — número simple añade "cm"', () => {
  assert.strictEqual(app.fmtCm('150'), '150 cm');
});
test('fmtCm — medida compuesta "120+180"', () => {
  assert.strictEqual(app.fmtCm('120+180'), '120+180 cm');
});
test('fmtCm — vacío devuelve guion', () => {
  assert.strictEqual(app.fmtCm(''), '—');
  assert.strictEqual(app.fmtCm(null), '—');
});
test('fmtCm — unidad especial TT en vez de cm', () => {
  assert.strictEqual(app.fmtCm('162TT'), '162 TT');
});

test('normalizeRecogida — variantes de izquierda', () => {
  assert.strictEqual(app.normalizeRecogida('IZQ'), 'IZQ');
  assert.strictEqual(app.normalizeRecogida('izquierda'), 'IZQ');
});
test('normalizeRecogida — variantes de central', () => {
  assert.strictEqual(app.normalizeRecogida('CENTRAL'), 'CEN');
});
test('normalizeRecogida — por defecto derecha', () => {
  assert.strictEqual(app.normalizeRecogida(''), 'D');
  assert.strictEqual(app.normalizeRecogida('LATERAL'), 'D');
});

test('normalizaTipoCanotex — PAQUETTO por código', () => {
  assert.strictEqual(app.normalizaTipoCanotex('PAQUETTO', '', ''), 'Paquetto');
});
test('normalizaTipoCanotex — CORTOP es Onda Perfecta', () => {
  assert.strictEqual(app.normalizaTipoCanotex('CORTOP', '', ''), 'Onda Perfecta');
});
test('normalizaTipoCanotex — VERTxx es Vertical', () => {
  assert.strictEqual(app.normalizaTipoCanotex('VERT01', '', ''), 'Vertical');
});
test('normalizaTipoCanotex — Estor con varillas por descripción', () => {
  assert.strictEqual(app.normalizaTipoCanotex('XXX', 'ESTOR CON VARILLAS', ''), 'Estor');
});

test('extraerDiametro — nombre comercial "MEDIUM" = 43mm', () => {
  assert.strictEqual(app.extraerDiametro('SISTEMA MEDIUM', '', 'P05C12'), '43mm');
});
test('extraerDiametro — código de tubo "(T58)" = 58mm', () => {
  assert.strictEqual(app.extraerDiametro('', 'CADENA (T58)', ''), '58mm');
});

test('calcularMetrosTela — Onda Perfecta', () => {
  assert.strictEqual(app.calcularMetrosTela('Onda Perfecta', '150', ''), 3.6);
});
test('calcularMetrosTela — Paquetto', () => {
  assert.strictEqual(app.calcularMetrosTela('Paquetto', '100', ''), 1.4);
});
test('calcularMetrosTela — ancho vacío devuelve null', () => {
  assert.strictEqual(app.calcularMetrosTela('Paquetto', '', ''), null);
});

test('calcularCorrederasTexto — medida única', () => {
  assert.strictEqual(app.calcularCorrederasTexto('150', '1', '8cm'), '20G');
});
test('calcularCorrederasTexto — medida compuesta, una hoja por tramo', () => {
  assert.strictEqual(app.calcularCorrederasTexto('150-142', '2', '8cm'), '20G - 20G');
});

console.log(`\n${pass} OK, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
