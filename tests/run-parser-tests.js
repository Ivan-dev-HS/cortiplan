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

console.log('\nparsear() — detección de instalación (ES/CA) y respaldo con datos del cliente');

test('Nota en catalán "INSTAL·LACIO INCLOSA" activa instalación y usa los datos del cliente', () => {
  app.resetInstalacion();
  app.document.getElementById('cnom').value = 'Cliente Ejemplo';
  app.document.getElementById('ctel').value = '600111222';
  app.document.getElementById('cdir').value = 'C/ Exemple, 1';
  app.document.getElementById('cpob').value = 'LLEIDA';
  app.parsear([
    'PRESUPUESTO DE VENTA',
    'REF. G700 CLIENTE SIETE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'SALO 1,00',
    'PAQUETTO MEDIDA:120X150 -MANDO:D 1,00',
    'TEJIDO: LISO GRIS',
    'NOTA: INSTAL·LACIO INCLOSA 1,00',
  ], true);
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.hayInstalacion, true);
  assert.strictEqual(app.document.getElementById('instCheck').checked, true);
  assert.strictEqual(app.document.getElementById('inom').value, 'Cliente Ejemplo');
  assert.strictEqual(app.document.getElementById('idir').value, 'C/ Exemple, 1');
  assert.strictEqual(app.document.getElementById('ipob').value, 'LLEIDA');
});

test('Sin mención de instalación no marca el checkbox', () => {
  app.resetInstalacion();
  app.parsear([
    'PRESUPUESTO DE VENTA',
    'REF. H800 CLIENTE OCHO',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'SALO 1,00',
    'PAQUETTO MEDIDA:120X150 -MANDO:D 1,00',
    'TEJIDO: LISO GRIS',
    'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA',
  ], true);
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.hayInstalacion, false);
  assert.strictEqual(app.document.getElementById('instCheck').checked, false);
});

console.log('\nColcha/Vánova/Nórdica y Friso');

test('normalizaTipo reconoce colcha, vànova y funda nórdica', () => {
  assert.strictEqual(app.normalizaTipo('COLCHA MATRIMONIO'), 'Colcha/Vánova/Nórdica');
  assert.strictEqual(app.normalizaTipo('vànova estampada'), 'Colcha/Vánova/Nórdica');
  assert.strictEqual(app.normalizaTipo('funda nordica 150'), 'Colcha/Vánova/Nórdica');
});
test('normalizaTipo reconoce friso', () => {
  assert.strictEqual(app.normalizaTipo('FRISO A JUEGO'), 'Friso');
});
test('normalizaTipoCanotex — colcha y friso solo por descripción', () => {
  assert.strictEqual(app.normalizaTipoCanotex('XXX', 'COLCHA PIQUE', ''), 'Colcha/Vánova/Nórdica');
  assert.strictEqual(app.normalizaTipoCanotex('XXX', 'FRISO A JUEGO', ''), 'Friso');
});
test('getSVG dibuja Colcha y Friso sin lanzar excepción', () => {
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Colcha/Vánova/Nórdica', ancho: '150', alto: '200' }));
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Friso', ancho: '150', alto: '40', hojas: '2' }));
});
test('Colcha no genera línea de corte (sin riel); Friso sí', () => {
  app.resetCortinas();
  app.addCortina({ tipo: 'Colcha/Vánova/Nórdica', ancho: '150', alto: '200', estancia: 'Test colcha' });
  app.addCortina({ tipo: 'Friso', ancho: '150', alto: '40', estancia: 'Test friso' });
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.cortinas.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(STATE.lineas.map(l => l.estancia))), ['Test friso']);
});

console.log('\nTapicería (y afines sin soporte)');

test('svgConSop no muestra "SOP:" para Tapicería, Colcha, Cojín ni Cabecero', () => {
  const tipos = ['Tapiceria', 'Colcha/Vánova/Nórdica', 'Cojín', 'Cabecero'];
  for (const tipo of tipos) {
    const svg = app.svgConSop({ tipo, ancho: '150', alto: '200', soporte: 'T' });
    assert.ok(!svg.includes('SOP:'), `${tipo} no debería mostrar SOP`);
  }
});
test('svgConSop sí muestra "SOP:" para una cortina normal', () => {
  const svg = app.svgConSop({ tipo: 'Paquetto', ancho: '150', alto: '200', soporte: 'T' });
  assert.ok(svg.includes('SOP:'));
});
test('svgConSop no muestra "SOP:" para cualquier tipo sin dibujo (regla general, no solo los tipos ya conocidos)', () => {
  const svg = app.svgConSop({ tipo: 'Un tipo inventado que no existe', ancho: '150', alto: '200', soporte: 'T' });
  assert.ok(!svg.includes('SOP:'));
});

console.log('\nVisillo, Cojín y Cabecero');

test('normalizaTipo reconoce visillo, cojín y cabecero/cabecera', () => {
  assert.strictEqual(app.normalizaTipo('VISILLO BORDADO'), 'Visillo');
  assert.strictEqual(app.normalizaTipo('cojin 45x45'), 'Cojín');
  assert.strictEqual(app.normalizaTipo('CABECERO TAPIZADO'), 'Cabecero');
  assert.strictEqual(app.normalizaTipo('cabecera cama'), 'Cabecero');
});
test('normalizaTipoCanotex — visillo, cojín y cabecero solo por descripción', () => {
  assert.strictEqual(app.normalizaTipoCanotex('XXX', 'VISILLO BORDADO', ''), 'Visillo');
  assert.strictEqual(app.normalizaTipoCanotex('XXX', 'COJIN 45X45', ''), 'Cojín');
  assert.strictEqual(app.normalizaTipoCanotex('XXX', 'CABECERO TAPIZADO', ''), 'Cabecero');
});
test('getSVG dibuja Visillo (como Palas/Tablas), Cojín y Cabecero sin lanzar excepción', () => {
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Visillo', ancho: '150', alto: '250', hojas: '2' }));
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Cojín', ancho: '45', alto: '45' }));
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Cabecero', ancho: '150', alto: '110' }));
});
test('Cojín y Cabecero no generan línea de corte; Visillo sí', () => {
  app.resetCortinas();
  app.addCortina({ tipo: 'Cojín', ancho: '45', alto: '45', estancia: 'Test cojín' });
  app.addCortina({ tipo: 'Cabecero', ancho: '150', alto: '110', estancia: 'Test cabecero' });
  app.addCortina({ tipo: 'Visillo', ancho: '150', alto: '250', estancia: 'Test visillo' });
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.cortinas.length, 3);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(STATE.lineas.map(l => l.estancia))), ['Test visillo']);
});

console.log('\nVertical en L y ubicación del soporte en el corte');
test('Vertical en L dibuja lamas (como la vertical recta), no el panel liso genérico', () => {
  const svg = app.getSVG({ tipo: 'Vertical', ancho: '150', alto: '220', anchoL: '100', altoL: '220',
    formaL: 'dcha', recogida: 'D', recogidaL: 'IZQ', soporte: 'T' });
  // Las lamas usan líneas gruesas #222/2.2, sin el guión de las divisiones de hoja del panel liso.
  const numLamas = (svg.match(/stroke="#222" stroke-width="2\.2"/g) || []).length;
  assert.ok(numLamas > 10, `esperaba muchas lamas, encontradas ${numLamas}`);
  assert.ok(!svg.includes('stroke-dasharray="3,3"'), 'no debería dibujar las divisiones de hoja del panel liso genérico');
});
test('Vertical en L dibuja el mando (cadena) en el lado contrario a las lamas, como svgVertical', () => {
  // Igual que en svgVertical (mandoLado según apertura 1/3): con recogida IZQ las
  // lamas se recogen a la derecha y el mando queda a la izquierda, y al revés con D.
  const svgIzq = app.getSVG({ tipo: 'Vertical', ancho: '150', alto: '220', anchoL: '100', altoL: '220',
    formaL: 'dcha', recogida: 'IZQ', recogidaL: 'IZQ', soporte: 'T' });
  const svgD = app.getSVG({ tipo: 'Vertical', ancho: '150', alto: '220', anchoL: '100', altoL: '220',
    formaL: 'dcha', recogida: 'D', recogidaL: 'D', soporte: 'T' });
  const dashed = svg => [...svg.matchAll(/<line x1="(-?[\d.]+)"[^>]*stroke-dasharray="2\.5,2"/g)].map(m => parseFloat(m[1]));
  const xsIzq = dashed(svgIzq), xsD = dashed(svgD);
  assert.ok(xsIzq.length >= 1, 'debería dibujar al menos una cadena de mando (recogida IZQ)');
  assert.ok(xsD.length >= 1, 'debería dibujar al menos una cadena de mando (recogida D)');
  // Con recogida IZQ el mando del tramo recto va más a la izquierda que con D.
  assert.ok(Math.min(...xsIzq) < Math.min(...xsD), 'el mando debería estar más a la izquierda con recogida IZQ que con D');
});
test('La ubicación del soporte (techo/pared) de la cortina pasa a su línea de corte', () => {
  app.resetCortinas();
  app.addCortina({ tipo: 'Onda Perfecta', ancho: '150', alto: '250', estancia: 'Test soporte', soporte: 'PARED' });
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.lineas.length, 1);
  assert.strictEqual(STATE.lineas[0].soporte, 'PARED');
});
test('"Limpiar todo" no deja bloqueada la previsualización en vivo', () => {
  // scheduleLiveRefresh() solo actúa si STATE.liveActive es true, y generarInst()
  // es el único sitio que lo vuelve a poner a true — así que si limpiarTodo() lo
  // pone a false, ningún cambio posterior (añadir/editar una cortina) vuelve a
  // generar la vista previa nunca más, hasta cambiar de pestaña a mano.
  app.resetCortinas();
  app.addCortina({ ancho: '150', alto: '200', estancia: 'Antes de limpiar' });
  app.limpiarTodo();
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.liveActive, true);
});

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
  // Algunos presupuestos reales solo traen una letra en MANDO/RECOG ("I"/"D").
  assert.strictEqual(app.normalizeRecogida('I'), 'IZQ');
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
