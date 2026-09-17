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
test('Tapicería no genera línea de corte (sin riel, igual que Colcha/Cojín/Cabecero)', () => {
  app.resetCortinas();
  app.addCortina({ tipo: 'Tapiceria', ancho: '150', alto: '200', estancia: 'Test tapicería' });
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.cortinas.length, 1);
  assert.strictEqual(STATE.lineas.length, 0, 'una Tapicería no debería producir ninguna línea de corte');
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
test('El nº de apertura también controla el tramo recto de una Vertical en L (ficha y dibujo)', () => {
  // El tramo recto de una Vertical en L es, mecánicamente, igual que una vertical
  // recta: el nº de apertura debe seguir controlando su ficha ("Nº X") Y su dibujo
  // (mismo patrón de lamas/flecha/mando que svgVertical), no solo la Recogida D/IZQ/CEN.
  const p = { tipo: 'Vertical', ancho: '150', alto: '220', apertura: '7', recogida: 'D', formaL: 'dcha', anchoL: '100', altoL: '220' };
  const html = app.fichaFilas(p);
  assert.ok(html.includes('Nº 7'), 'la ficha debería mostrar el nº de apertura también en una cortina en L');

  const svgAp7 = app.getSVG(p);
  const svgApNone = app.getSVG({ ...p, apertura: '' }); // sin apertura: cae al fallback por Recogida (D → ap 3)
  assert.notStrictEqual(svgAp7, svgApNone, 'apertura=7 (doble centro) debería dibujarse distinto que el fallback de Recogida D');
  // apertura 7 = "doble centro · mando doble": el lado que toca la esquina de la L
  // se omite (ahí quedaría oculto bajo el tramo L), así que en este caso concreto
  // (esquina a la derecha) el tramo recto dibuja un único mando (izquierdo), más
  // el propio mando del tramo L = 2 líneas discontinuas en total.
  const dashedCount = (svgAp7.match(/stroke-dasharray="2\.5,2"/g) || []).length;
  assert.strictEqual(dashedCount, 2, `esperaba 1 mando del tramo recto (el lado de la esquina se omite) + 1 del tramo L, encontradas ${dashedCount}`);
});
test('Brisa en L sigue mostrando la Recogida D/IZQ/CEN (el nº de apertura aún no se dibuja ahí)', () => {
  const p = { tipo: 'Brisa', ancho: '150', alto: '220', apertura: '7', recogida: 'D', formaL: 'dcha', anchoL: '100' };
  const html = app.fichaFilas(p);
  assert.ok(!html.includes('Nº 7'), 'Brisa en L no debería mostrar el nº de apertura (su dibujo en L aún no lo usa)');
  assert.ok(html.includes('Derecha'), 'debería mostrar la Recogida D/IZQ/CEN en su lugar');
});
test('Vertical en L dibuja lamas (como la vertical recta), no el panel liso genérico', () => {
  const svg = app.getSVG({ tipo: 'Vertical', ancho: '150', alto: '220', anchoL: '100', altoL: '220',
    formaL: 'dcha', recogida: 'D', recogidaL: 'IZQ', soporte: 'T' });
  // Las lamas usan líneas gruesas #222/2.2, sin el guión de las divisiones de hoja del panel liso.
  const numLamas = (svg.match(/stroke="#222" stroke-width="2\.2"/g) || []).length;
  assert.ok(numLamas > 10, `esperaba muchas lamas, encontradas ${numLamas}`);
  assert.ok(!svg.includes('stroke-dasharray="3,3"'), 'no debería dibujar las divisiones de hoja del panel liso genérico');
});
test('Vertical en L dibuja el mando (cadena), evitando siempre el lado de la esquina', () => {
  const dashedXs = svg => [...svg.matchAll(/<line x1="(-?[\d.]+)"[^>]*stroke-dasharray="2\.5,2"/g)].map(m => parseFloat(m[1]));
  // Esquina a la derecha: el lado libre del tramo recto es el IZQUIERDO. Con
  // recogida D el mando "normal" caería justo en la esquina (donde empieza el
  // tramo en L) y no se vería, así que debe pasarse también al izquierdo, igual
  // que con IZQ: ambos deben acabar muy cerca uno del otro (mismo lado).
  const svgIzq = app.getSVG({ tipo: 'Vertical', ancho: '150', alto: '220', anchoL: '100', altoL: '220',
    formaL: 'dcha', recogida: 'IZQ', recogidaL: 'D', soporte: 'T' });
  const svgD = app.getSVG({ tipo: 'Vertical', ancho: '150', alto: '220', anchoL: '100', altoL: '220',
    formaL: 'dcha', recogida: 'D', recogidaL: 'D', soporte: 'T' });
  const xsIzq = dashedXs(svgIzq), xsD = dashedXs(svgD);
  assert.ok(xsIzq.length >= 1, 'debería dibujar al menos una cadena de mando (recogida IZQ)');
  assert.ok(xsD.length >= 1, 'debería dibujar al menos una cadena de mando (recogida D)');
  assert.ok(Math.abs(Math.min(...xsIzq) - Math.min(...xsD)) < 2,
    `con la esquina a la derecha, el mando del tramo recto debería quedar en el mismo lado (libre) para D e IZQ; xsIzq=${xsIzq} xsD=${xsD}`);
});
test('El tramo L de una Vertical en L tiene su propio nº de apertura, independiente del tramo recto', () => {
  const base = { tipo: 'Vertical', ancho: '170', alto: '250', formaL: 'dcha', anchoL: '170', altoL: '250', recogida: 'D', recogidaL: 'D' };
  const svgAp1ApL1 = app.getSVG({ ...base, apertura: '1', aperturaL: '1' });
  const svgAp1ApL8 = app.getSVG({ ...base, apertura: '1', aperturaL: '8' });
  const svgAp8ApL1 = app.getSVG({ ...base, apertura: '8', aperturaL: '1' });
  assert.notStrictEqual(svgAp1ApL1, svgAp1ApL8, 'cambiar solo la apertura del tramo L debería cambiar el dibujo');
  assert.notStrictEqual(svgAp1ApL1, svgAp8ApL1, 'cambiar solo la apertura del tramo recto debería cambiar el dibujo');
  assert.notStrictEqual(svgAp1ApL8, svgAp8ApL1, 'las combinaciones cruzadas deberían dar dibujos distintos');
});
test('La ficha muestra el nº de recogida del tramo L en su propia fila "Recogida L"', () => {
  const p = { tipo: 'Vertical', ancho: '170', alto: '250', formaL: 'dcha', anchoL: '170', altoL: '250',
    apertura: '3', aperturaL: '9', recogida: 'D', recogidaL: 'D' };
  const html = app.fichaFilas(p);
  assert.ok(html.includes('Nº 3'), 'la ficha debería mostrar el nº de apertura del tramo recto');
  assert.ok(/Recogida L[\s\S]{0,120}Nº 9/.test(html), 'la ficha debería mostrar una fila "Recogida L" con el nº de apertura del tramo L');
  // Sin apertura L → cae al fallback por Recogida L (D/IZQ/CEN), igual que el tramo recto
  const htmlSinApL = app.fichaFilas({ ...p, aperturaL: '' });
  assert.ok(/Recogida L[\s\S]{0,120}Derecha/.test(htmlSinApL), 'sin apertura L debería caer al fallback de Recogida L (D/IZQ/CEN)');
});
test('El mando del tramo L también evita siempre el lado de la esquina, para cualquier apertura L', () => {
  const dashedCount = svg => (svg.match(/stroke-dasharray="2\.5,2"/g) || []).length;
  const base = { tipo: 'Vertical', ancho: '170', alto: '250', formaL: 'dcha', anchoL: '170', altoL: '250', apertura: '3', recogida: 'D' };
  // Con esquina a la derecha, el punto que toca la esquina del tramo L es
  // siempre el mismo lado físico: cualquier apertura L (simple o "doble") debe
  // seguir dando exactamente 1 mando del tramo recto + 1 del tramo L = 2 en
  // total, nunca más (que indicaría que se dibujó encima de la esquina) ni menos.
  for (const apL of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
    const svg = app.getSVG({ ...base, aperturaL: apL });
    assert.strictEqual(dashedCount(svg), 2, `apertura L=${apL}: esperaba 2 líneas de mando en total, encontradas ${dashedCount(svg)}`);
  }
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

console.log('\nHoja de corte: reparto en varias páginas y fórmulas compartidas');

test('chunkLineas reparte un pedido largo en varias hojas de como máximo n líneas, sin perder ninguna', () => {
  const lineas = Array.from({ length: 13 }, (_, i) => ({ id: 'l' + i }));
  const paginas = JSON.parse(JSON.stringify(app.chunkLineas(lineas, 10)));
  assert.strictEqual(paginas.length, 2, 'un pedido de 13 líneas con máximo 10 por hoja debería dar 2 hojas');
  assert.strictEqual(paginas[0].length, 10);
  assert.strictEqual(paginas[1].length, 3);
  assert.deepStrictEqual(paginas.flat(), lineas, 'ninguna línea debería perderse ni duplicarse al repartir');
});
test('chunkLineas con menos líneas que el máximo devuelve una única hoja', () => {
  const lineas = Array.from({ length: 4 }, (_, i) => ({ id: 'l' + i }));
  const paginas = app.chunkLineas(lineas, 10);
  assert.strictEqual(paginas.length, 1);
  assert.strictEqual(paginas[0].length, 4);
});
test('calcularVarillas da el mismo resultado que antes de consolidar la fórmula en las 3 llamadas (dibujo/ficha/corte)', () => {
  assert.strictEqual(app.calcularVarillas('220'), 10);
  assert.strictEqual(app.calcularVarillas(''), 0, 'sin alto no debería lanzar ni devolver NaN');
  assert.strictEqual(app.calcularVarillas('0'), 0);
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
