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

console.log('\nParser: reconstruir SISTEMA cuando el PDF corta o contamina la línea');
test('SISTEMA DE INSTALACION se une con la siguiente línea aunque el corte caiga a mitad de "- COLOR" / "BLANCO..."', () => {
  // Presupuesto real: el PDF corta la frase justo después de "COLOR", dejando
  // el nombre del color al principio de la línea siguiente en vez de después
  // de una coma o un guion al final (los únicos casos que ya se unían antes).
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. F600 CLIENTE SEIS',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'COMEDOR 1,00',
    'CORTOP MEDIDA:180x246,5H -CONFE:1 HOJA - RECOG:IZQ',
    'UD. CORTINA CONFECCIONADA TIPO ONDA PERFECTA. (ONDA 6cm.)',
    'TEJIDO: EJEMPLO COLOR 2',
    'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA - COLOR',
    'BLANCO - CORR.OP DE 6 CM',
    'SOPORTES TECHO',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].sistema, 'GUIA MANUAL 1 VIA - COLOR BLANCO',
    'debería unir "COLOR" (fin de línea) con "BLANCO" (línea siguiente) y quitar la coletilla de correderas, incluido el "DE 6 CM" que la acompaña');
});
test('Una línea de cabecera/pie de página que arrastra datos reales (SISTEMA/TEJIDO) no se descarta entera', () => {
  // A veces el texto de pie de página del presupuesto (CIF, registro mercantil)
  // cae por casualidad a la misma altura que la línea de SISTEMA en el PDF, y
  // el extractor de texto los junta en una sola línea. Antes, como esa línea
  // empezaba por "CIF." (un marcador de pie de página conocido), se descartaba
  // entera — perdiendo el SISTEMA real que llevaba pegado detrás. Es el caso
  // que más veces pasa en la última cortina de un presupuesto (que es la que
  // suele coincidir en altura con el pie de página).
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. G700 CLIENTE SIETE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'DORMITORIO 1,00',
    'CORTOP MEDIDA:180x248H -CONFE:1 HOJA - RECOG:IZQ',
    'UD. CORTINA CONFECCIONADA TIPO ONDA PERFECTA. (ONDA 6cm.)',
    'TEJIDO: EJEMPLO COLOR 19',
    'CIF. B00000000 Inscrita Reg. Mercantil de Lleida. Tomo 1, folio 1, Hoja L-1 SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA - COLOR',
    'BLANCO - CORR.OP DE 6 CM',
    'SOPORTES TECHO',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].sistema, 'GUIA MANUAL 1 VIA - COLOR BLANCO',
    'el SISTEMA no debería perderse solo porque la línea empiece con texto de pie de página');
});
test('SISTEMA se sigue uniendo aunque el corte de línea no encaje con ningún patrón conocido de antemano', () => {
  // Probado con varios presupuestos reales: cada uno corta la frase de
  // SISTEMA DE INSTALACION en un punto distinto ("...BLANCA" + "CON CODO A LA
  // IZQUIERDA.", "...DEL CLIENTE" + "ADAPTANDO A LA MEDIDA."). Mantener una
  // lista cerrada de frases de continuación se queda corta cada vez que
  // aparece un presupuesto nuevo, así que ahora se une todo lo que venga a
  // continuación mientras no sea otra etiqueta de campo.
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. H800 CLIENTE OCHO',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'SALON 1,00',
    'CORTPLA MEDIDA:300x250H -CONFE:1 HOJA - RECOG:D',
    'UD. CORTINA CONFECCIONADA PLANA.',
    'TEJIDO: EJEMPLO LISO',
    'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA COLOR BLANCA',
    'CON CODO A LA IZQUIERDA.',
    'SOPORTE TECHO',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].sistema, 'GUIA MANUAL 1 VIA COLOR BLANCA CON CODO A LA IZQUIERDA');
});
test('SISTEMA no se une con la línea separadora decorativa ("Z - - - - -") que Canotex mete entre artículos', () => {
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. I900 CLIENTE NUEVE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'SALON 1,00',
    'CORTOP MEDIDA:150x250H -CONFE:1 HOJA - RECOG:D',
    'UD. CORTINA CONFECCIONADA ONDA PERFECTA.',
    'TEJIDO: EJEMPLO LISO',
    'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA COLOR BLANCA.',
    'Z - - - - - 1,00',
    'DORMITORIO 1,00',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].sistema, 'GUIA MANUAL 1 VIA COLOR BLANCA',
    'la línea separadora "Z - - - - -" no debería colarse dentro del sistema');
});

console.log('\nParser: tejido, zona de instalación y datos del cliente');
test('El tejido con guion en el nombre ("LINEN 03 - PIEDRA") se extrae completo, no vacío', () => {
  // Antes, la clase de caracteres de la extracción de tejido no incluía el
  // guion, así que la extracción entera fallaba (ni "LINEN 03" parcial, nada)
  // en vez de cortar limpiamente antes del guion.
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. J100 CLIENTE DIEZ',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'DORMITORIO 1,00',
    'LIN03CA43 MEDIDA:140x160H - MANDO: D -CAIDA: DEL- SOP:T',
    'CORTINA ENROLLABLE MANDO A CADENA SISTEMA',
    'MEDIUM A CADENA (T43), TEJIDO LINEN 03 - PIEDRA. SOP.GRIS',
  ].join('\n'),
    out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].tejido, 'LINEN 03 - PIEDRA');
});
test('ZONA no hace match dentro de un nombre de tejido que la contiene ("AMAZONA")', () => {
  // "ZONA" es un patrón de instalación ("ZONA: XXX"), pero sin límite de
  // palabra también hacía match dentro de "AMAZONA" (un tejido), inventando
  // una zona de instalación falsa a partir del nombre del tejido.
  app.resetInstalacion();
  app.parsear([
    'PRESUPUESTO DE VENTA',
    'REF. K200 CLIENTE ONCE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'DORMITORIO 1,00',
    'AMA02CA32 MEDIDA:73x105H - MANDO: D -CAIDA: DEL- SOP:T',
    'CORTINA ENROLLABLE MANDO A CADENA SISTEMA',
    'SIMPLY (T32), TEJIDO AMAZONA AMA02 BEIG.SOP.BEIG',
    'NOTA: INSTAL·LACIO INCLOSA.',
  ], true);
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.instZona, '',
    `no debería detectar ninguna zona a partir de "AMAZONA", detectó: "${STATE.instZona}"`);
});
test('TEJIDO vacío en el presupuesto no arrastra el texto de la sección de pago ("PAGAMENT FORMA DE PAGAMENT")', () => {
  // Cuando el operario deja el campo TEJIDO en blanco, esa línea puede caer a
  // la misma altura que el inicio de la sección de pago en el PDF, y el
  // extractor de texto los junta en una sola línea ("TEJIDO: PAGAMENT FORMA
  // DE PAGAMENT"). Antes eso se colaba como si fuera el nombre del tejido.
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. DESPATX',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'PAQUETTO MEDIDA:124,5x160H -MANDO:D',
    'ESTOR TIPO PAQUETTO CON MANDO A CADENA OCULTO.',
    'TEJIDO: PAGAMENT FORMA DE PAGAMENT 1,00',
    '50% A LA ACEPTACION DEL PRESUPUESTO',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].tejido, '', 'el tejido debería quedar vacío, no con texto de la sección de pago');
});

console.log('\nParser: artículos con precio pero sin MEDIDA: reconocible (ficha en blanco)');
test('Un artículo con precio pero sin "MEDIDA:" (p.ej. una cortina Velux de catálogo) genera una ficha en blanco, no se pierde', () => {
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. L300 CLIENTE DOCE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'ZONA DE DALT 1,00',
    'CORTINAS CORTINA TIPO VELUX SK06 TEJIDO BLANCO. 1,00 168,00 168,00',
    'cortinas tipo.',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].enBlanco, true);
  assert.strictEqual(out[0].ancho, '');
  assert.strictEqual(out[0].alto, '');
  assert.ok(out[0].estancia.includes('ZONA DE DALT'), 'debería incluir la estancia detectada');
  assert.ok(out[0].estancia.includes('VELUX'), 'debería incluir una descripción del artículo para identificarlo');
});
test('Una ficha en blanco sin ancho ni alto no genera línea en la hoja de corte', () => {
  app.resetCortinas();
  app.addCortina({ estancia: 'ZONA DE DALT · CORTINA VELUX', ancho: '', alto: '', enBlanco: true });
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.cortinas.length, 1);
  assert.strictEqual(STATE.lineas.length, 0, 'sin ancho/alto todavía no hay nada que cortar');
});
test('Un pedido en texto libre sin ninguna etiqueta reconocible (encargo de tapicería) no genera ninguna ficha inventada', () => {
  // Antes, "cojin de 60x60" mencionado en un párrafo de tapicería en texto
  // libre se colaba como si fuera una cortina de 60x60. El usuario ha pedido
  // explícitamente que estos pedidos no generen ninguna ficha automática.
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. TAPIZADO COLCHONETA Y COJINES',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'funda para colchoneta triangular, con tejido tapicero calidad',
    '1,00 780,00 780,00',
    'funda con el mismo tejido para cojin de 60x60 4,00 30,00 120,00',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 0, 'un pedido de tapicería en texto libre no debería generar ninguna cortina/ficha');
});

console.log('\nParser: artículo TIRADOR (accesorio) no contamina la cortina anterior');
test('TIRADOR con color, tras una cortina real, no se une al SISTEMA de esa cortina y se marca "soloCorte"', () => {
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. M400 CLIENTE TRECE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'SALON 1,00',
    'PAQUETTO MEDIDA:120x150H -MANDO:D 1,00',
    'TEJIDO: LISO GRIS',
    'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA',
    'TIRADOR COLOR NEGRO 1,00 12,00 12,00',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 2, 'debería haber la cortina real + el accesorio tirador');
  assert.ok(!/TIRADOR/i.test(out[0].sistema || ''), 'el SISTEMA de la cortina no debe llevar el texto del tirador');
  assert.strictEqual(out[1].soloCorte, true, 'el tirador se marca para que solo vaya a la hoja de corte');
  assert.strictEqual(out[1].sistema, 'Tirador');
  assert.strictEqual(out[1].color, 'Negro');
});
test('Un accesorio TIRADOR no genera ficha de instalador, solo línea en la hoja de corte', () => {
  app.resetInstalacion();
  app.parsear([
    'PRESUPUESTO DE VENTA',
    'REF. N500 CLIENTE CATORCE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'SALON 1,00',
    'PAQUETTO MEDIDA:120x150H -MANDO:D 1,00',
    'TEJIDO: LISO GRIS',
    'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA',
    'TIRADOR COLOR BLANCO 1,00 12,00 12,00',
  ], true);
  const STATE = app.__internals.STATE;
  assert.strictEqual(STATE.cortinas.length, 1, 'el tirador no debe generar una ficha/tarjeta de instalador');
  const lineaTirador = STATE.lineas.find(l => l.sistema === 'Tirador');
  assert.ok(lineaTirador, 'debería existir una línea de corte para el tirador');
  assert.strictEqual(lineaTirador.color, 'Blanco');
});

console.log('\nCortinas juntas (dos rectas, una al lado de la otra)');
test('unirJuntas fusiona la siguiente cortina como 2º tramo recto, sin inclinarla', () => {
  app.resetCortinas();
  app.addCortina({ estancia: 'Cortina A', ancho: '150', alto: '250', tipo: 'Onda Perfecta', hojas: '1', recogida: 'D' });
  app.addCortina({ estancia: 'Cortina B', ancho: '100', alto: '220', tipo: 'Onda Perfecta', hojas: '1', recogida: 'IZQ' });
  const STATE = app.__internals.STATE;
  const idA = STATE.cortinas[0].id;
  app.unirJuntas(idA);
  assert.strictEqual(STATE.cortinas.length, 1, 'la 2ª cortina se fusiona en la 1ª, no queda como tarjeta aparte');
  const a = STATE.cortinas[0];
  assert.ok(a.formaJunta === 'izq' || a.formaJunta === 'dcha');
  assert.strictEqual(a.formaL, '', 'formaJunta y formaL son excluyentes');
  assert.strictEqual(a.anchoL, '100');
  assert.strictEqual(a.altoL, '220');
  // Dos líneas de corte independientes, cada una con su propia medida
  assert.strictEqual(STATE.lineas.length, 2);
  assert.strictEqual(STATE.lineas[0].ancho, '150');
  assert.strictEqual(STATE.lineas[1].ancho, '100');
});
test('svgFormaJuntas dibuja los dos tramos rectos (sin incline) y respeta las caídas de cada Paquetto', () => {
  const svg = app.svgFormaJuntas({
    tipo: 'Paquetto', ancho: '90', alto: '150', hojas: '1', recogida: 'D',
    formaJunta: 'dcha', anchoL: '260', altoL: '150', hojasL: '1', recogidaL: 'IZQ',
  }, 'tjunit');
  const caidas = [...svg.matchAll(/(\d+) caídas/g)].map(m => m[1]);
  assert.deepStrictEqual(caidas, ['2', '5'], 'cada tramo debe mostrar sus propias caídas según su ancho real');
  // Sin incline: cada tramo dibuja su propio riel recto (<rect>, de cuerpoConfeccion),
  // no el riel-paralelogramo inclinado (<path> cerrado en "Z") que usa svgFormaL
  // para el tramo en L.
  assert.ok(!/<path d="M[\d.]+,[\d.]+ L[\d.]+,[\d.]+ L[\d.]+,[\d.]+ L[\d.]+,[\d.]+ Z" fill="none" stroke="#111" stroke-width="1.8"\/>/.test(svg),
    'no debería usar el riel inclinado en forma de paralelogramo de la L');
});
test('setForma alterna entre Recta / En L / Juntas de forma mutuamente excluyente', () => {
  app.resetCortinas();
  app.addCortina({ estancia: 'C1', ancho: '150', alto: '250', tipo: 'Plana' });
  const STATE = app.__internals.STATE;
  const id = STATE.cortinas[0].id;
  app.setForma(id, 'Jdcha');
  assert.strictEqual(STATE.cortinas[0].formaJunta, 'dcha');
  assert.strictEqual(STATE.cortinas[0].formaL, '');
  app.setForma(id, 'Lizq');
  assert.strictEqual(STATE.cortinas[0].formaL, 'izq');
  assert.strictEqual(STATE.cortinas[0].formaJunta, '', 'al pasar a L debe limpiarse formaJunta');
  app.setForma(id, '');
  assert.strictEqual(STATE.cortinas[0].formaL, '');
  assert.strictEqual(STATE.cortinas[0].formaJunta, '');
});

console.log('\nGusanillo (CORTPASG)');
test('normalizaTipoCanotex reconoce CORTPASG como Gusanillo', () => {
  assert.strictEqual(app.normalizaTipoCanotex('CORTPASG', '', ''), 'Gusanillo');
  assert.strictEqual(app.normalizaTipoCanotex('XXX', 'cinta gusanillo', ''), 'Gusanillo');
});
test('normalizaTipo reconoce "gusanillo" en el selector manual', () => {
  assert.strictEqual(app.normalizaTipo('Gusanillo'), 'Gusanillo');
});
test('Un presupuesto con CORTPASG se detecta como cortina Gusanillo, no se pierde', () => {
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. P600 CLIENTE QUINCE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'COCINA 1,00',
    'CORTPASG MEDIDA:120x150H -MANDO:D 1,00',
    'UD. CONFECCION GUSANILLO CON PESTAÑA',
    'TEJIDO: LISO BEIGE',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].tipo, 'Gusanillo');
  assert.strictEqual(out[0].pestana, 'con');
});
test('Un CORTPASG "SIN PESTAÑA" se anota como tal, no como "con" por defecto', () => {
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. P601 CLIENTE DIECISEIS',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'COCINA 1,00',
    'CORTPASG MEDIDA:120x150H -MANDO:D 1,00',
    'UD. CONFECCION GUSANILLO SIN PESTAÑA',
    'TEJIDO: LISO BEIGE',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out[0].pestana, 'sin');
});
test('getSVG dibuja Gusanillo sin lanzar excepción, con y sin pestaña anotada', () => {
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1' }));
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '2', pestana: 'con' }));
  assert.doesNotThrow(() => app.getSVG({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1', pestana: 'sin' }));
});
test('svgGusanillo: marco casi cuadrado (1:1), sin remates que sobresalgan por encima', () => {
  const svg = app.svgGusanillo({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1', pestana: 'con', recogida: 'D' }, 'gchk');
  // Un único <rect>: el marco. Nada de riel/soportes aparte (CW=234, CH=145
  // en SV, así que el lado del marco cuadrado es CH=145, centrado en el ancho).
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
  assert.strictEqual(rects.length, 1, 'solo debe haber un <rect>: el marco (nada de riel ni palas por hoja)');
  const [, x, y, w, h] = rects[0];
  assert.strictEqual(w, h, 'el marco debe ser cuadrado (ancho = alto en el dibujo), no deformado por la medida real');
  assert.strictEqual(w, '145.0');
  assert.strictEqual(x, '58.5');
  assert.strictEqual(y, '46.0');
  assert.ok(!svg.includes('stroke-width="2"'), 'no debe quedar ningún remate/soporte suelto (usaban stroke-width 2)');
});
test('svgGusanillo: dos líneas horizontales arriba (9%/14%) y dos abajo (86%/91%), de lado a lado del marco', () => {
  const svg = app.svgGusanillo({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1' }, 'glin');
  // Excluye las líneas de cota (llevan marker-start/marker-end para la flecha).
  const lineas = [...svg.matchAll(/<line ([^>]*?)\/>/g)].map(m => m[1]).filter(attrs => !attrs.includes('marker'));
  const attr = (s, name) => (s.match(new RegExp(name + '="([^"]+)"')) || [])[1];
  const lineasH = lineas.filter(a => attr(a, 'y1') === attr(a, 'y2'));
  const ys = lineasH.map(a => attr(a, 'y1')).sort((a, b) => parseFloat(a) - parseFloat(b));
  assert.deepStrictEqual(ys, ['59.0', '66.3', '170.7', '178.0'], 'deben estar exactamente al 9%, 14%, 86% y 91% del marco');
  for (const a of lineasH) {
    assert.strictEqual(attr(a, 'x1'), '58.5', 'cada línea horizontal debe tocar el lateral izquierdo del marco');
    assert.strictEqual(attr(a, 'x2'), '203.5', 'cada línea horizontal debe tocar el lateral derecho del marco');
  }
});
test('svgGusanillo: exactamente 5 pliegues verticales, en su posición y centrados en la zona central', () => {
  const svg = app.svgGusanillo({ tipo: 'Gusanillo', ancho: '150', alto: '200' }, 'gpli');
  // Excluye las líneas de cota (llevan marker-start/marker-end para la flecha).
  const lineas = [...svg.matchAll(/<line ([^>]*?)\/>/g)].map(m => m[1]).filter(attrs => !attrs.includes('marker'));
  const attr = (s, name) => (s.match(new RegExp(name + '="([^"]+)"')) || [])[1];
  const verticales = lineas.filter(a => attr(a, 'x1') === attr(a, 'x2'));
  assert.strictEqual(verticales.length, 5, 'deben ser exactamente 5 pliegues, no 9');
  const esperado = [
    ['80.3', '82.0', '155.0'],
    ['104.9', '89.8', '147.2'],
    ['119.4', '108.1', '128.9'],
    ['142.6', '84.6', '152.4'],
    ['167.3', '92.4', '144.6'],
  ];
  const obtenido = verticales.map(a => [attr(a, 'x1'), attr(a, 'y1'), attr(a, 'y2')]);
  assert.deepStrictEqual(obtenido, esperado);
  // Ningún pliegue debe tocar una línea horizontal (14% = y 66.3, 86% = y 170.7)
  for (const a of verticales) {
    const y1 = attr(a, 'y1'), y2 = attr(a, 'y2');
    assert.ok(parseFloat(y1) > 66.3 && parseFloat(y2) < 170.7, 'el pliegue no debe tocar las líneas horizontales de la zona central');
  }
});
test('svgGusanillo: sin texto de pestaña ni flecha de recogida superpuestos (no están en el boceto)', () => {
  const svg = app.svgGusanillo({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1', pestana: 'con', recogida: 'D' }, 'gchk2');
  assert.ok(!svg.includes('PESTAÑA'));
  assert.ok(!svg.includes('stroke-dasharray="3,2"'));
});
test('fichaFilas: la fila "Pestaña" de un Gusanillo se ve siempre (con/sin/sin especificar), no solo cuando viene del presupuesto', () => {
  const conPestana = app.fichaFilas({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1', pestana: 'con' });
  assert.ok(conPestana.includes('<div class="fdat-k">Pestaña</div><div class="fdat-v sm">Con pestaña</div>'));
  const sinPestana = app.fichaFilas({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1', pestana: 'sin' });
  assert.ok(sinPestana.includes('<div class="fdat-k">Pestaña</div><div class="fdat-v sm">Sin pestaña</div>'));
  // Sin dato del presupuesto: la fila sigue apareciendo (invita a rellenarla
  // a mano) en vez de desaparecer como si la opción no existiera.
  const sinDato = app.fichaFilas({ tipo: 'Gusanillo', ancho: '150', alto: '200', hojas: '1' });
  assert.ok(sinDato.includes('<div class="fdat-k">Pestaña</div>'), 'la fila debe mostrarse aunque no se haya detectado con/sin pestaña');
  assert.ok(sinDato.includes('sin especificar'));
  // Otros tipos de cortina no llevan esta fila (no tiene sentido para ellos)
  const otroTipo = app.fichaFilas({ tipo: 'Plana', ancho: '150', alto: '200', hojas: '1' });
  assert.ok(!otroTipo.includes('Pestaña'));
});
test('CORTPASG sin "MEDIDA:" propia, con el bloque "MEDIDAS :" (varias piezas) de un pedido real, no se pierde', () => {
  // Formato real de Canotex para el gusanillo: el artículo no lleva
  // "MEDIDA:" en su línea (a diferencia del resto de códigos), las medidas
  // vienen más abajo en un bloque "MEDIDAS :" que puede tener más de una
  // pieza (p.ej. un gusanillo "arriba y abajo" de distinto tamaño cada uno).
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. P800 CLIENTE DIECIOCHO',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'ZONA COCINA 1,00',
    'CORTPASG CORTINA CONFECCION PASO GUSANILLO 1,00 167,94 50,00 83,97',
    'VISILLO CONFECCION PASO GUSANILLO',
    'FRUNCIDO AL DOBLE',
    'CON SISTEMA DE BARRITA PRESION NEGRA',
    'MEDIDAS : 58,5CM ANCHO x 121 CM ALTO - 1 UNIDAD',
    ' 58,5CM ANCHO x 52 CM ALTO - 1 UNIDAD',
    'PASO GUSANILLO ARRIBA Y ABAJO',
    'TEJIDO CONFECCION : NOGALES 3',
    'ZONA BAÑO 1,00',
    'CORTPASG CORTINA CONFECCION PASO GUSANILLO 2,00 84,51 50,00 84,51',
    'VISILLO CONFECCION PASO GUSANILLO',
    'SEMIPLANA',
    'CON SISTEMA DE BARRITA PRESION NEGRA',
    'MEDIDAS : 49 CM ANCHO x 84 CM ALTO',
    'PASO GUSANILLO ARRIBA Y BAJO SUELTO CON BORA PEQUEÑA',
    'TEJIDO CONFECCION : NOGALES 3',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 4, 'ZONA COCINA (2 piezas) + ZONA BAÑO ×2 (cantidad) = 4 cortinas');
  assert.strictEqual(out[0].tipo, 'Gusanillo');
  assert.strictEqual(out[0].ancho, '58.5');
  assert.strictEqual(out[0].alto, '121');
  assert.strictEqual(out[1].ancho, '58.5');
  assert.strictEqual(out[1].alto, '52');
  assert.strictEqual(out[0].tejido, 'NOGALES 3');
  assert.strictEqual(out[2].ancho, '49');
  assert.strictEqual(out[3].ancho, '49', 'la cantidad 2,00 duplica la única medida encontrada');
});
test('El pie de página (CIF, registro mercantil) pegado tras el tejido del bloque MEDIDAS no se cuela en el tejido', () => {
  // Pasa en pedidos reales: la línea del pie cae a la misma altura que
  // "TEJIDO CONFECCION : NOGALES 3" y el PDF las junta en una sola línea de
  // texto reconstruido ("...NOGALES 3" + "CIF. B2526...").
  const txt = [
    'PRESUPUESTO DE VENTA',
    'REF. P900 CLIENTE DIECINUEVE',
    'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
    'ZONA COCINA 1,00',
    'CORTPASG CORTINA CONFECCION PASO GUSANILLO 1,00 167,94 50,00 83,97',
    'VISILLO CONFECCION PASO GUSANILLO',
    'MEDIDAS : 58,5CM ANCHO x 121 CM ALTO - 1 UNIDAD',
    'TEJIDO CONFECCION : NOGALES 3',
    'CIF. B25264813 Inscrita Reg. Mercantin de Lleida. Tomo 92, folio 61, Hoja L-1.646',
  ].join('\n');
  const out = app.estrategiaCanotex(txt);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].tejido, 'NOGALES 3', 'el tejido no debe arrastrar el texto del CIF');
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
test('fmtCm — XSS: texto HTML en el campo Ancho/Alto (tecleado a mano) se escapa, no se inyecta', () => {
  // fmtCm() se inserta tal cual en innerHTML (ficha de instalador, dibujos
  // SVG). Un valor que no sea un número puro se devolvía sin escapar, así
  // que un usuario podía teclear HTML/JS en el campo Ancho o Alto y que se
  // ejecutara al generar la vista previa.
  assert.strictEqual(app.fmtCm('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!app.fmtCm('150<img src=x onerror=alert(1)>').includes('<img'), 'el texto tras el número también debe escaparse');
  assert.ok(app.fmtCm('150<img src=x onerror=alert(1)>').includes('&lt;img'));
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
test('calcularCorrederasTexto — nº de hojas negativo no lanza RangeError (Array(nH) con nH<0)', () => {
  // Bug real: Array(nH).fill(...) con nH negativo (p.ej. "Nº Hojas" tecleado
  // a mano como "-1") lanzaba "RangeError: Invalid array length" y rompía
  // toda la vista previa/PDF de instalación para el pedido completo.
  assert.doesNotThrow(() => app.calcularCorrederasTexto('150', '-1', '8cm'));
  assert.strictEqual(app.calcularCorrederasTexto('150', '-1', '8cm'), app.calcularCorrederasTexto('150', '1', '8cm'));
});
test('calcularCorrederasTexto — nº de hojas absurdamente grande no cuelga ni lanza excepción', () => {
  assert.doesNotThrow(() => app.calcularCorrederasTexto('150', '999999999', '8cm'));
  const partes = app.calcularCorrederasTexto('150', '999999999', '8cm').split(' - ');
  assert.ok(partes.length <= 20, 'el nº de hojas debe acotarse a un máximo razonable');
});

test('calcularMetrosTela — ancho negativo devuelve null, no metros negativos', () => {
  // Un ancho negativo (p.ej. tecleado a mano) no debe producir una cantidad
  // de tela negativa en la hoja de corte.
  assert.strictEqual(app.calcularMetrosTela('Onda Perfecta', '-150', ''), null);
  assert.strictEqual(app.calcularMetrosTela('Paquetto', '-100', ''), null);
});
test('calcularSoportes — ancho negativo devuelve vacío, no un nº de soportes inventado', () => {
  // "!a" solo descarta 0/NaN: un ancho negativo (p.ej. tecleado a mano) es
  // truthy y antes caía en el primer tramo de la tabla, devolviendo un nº de
  // soportes con apariencia válida para una medida que no tiene sentido físico.
  assert.strictEqual(app.calcularSoportes('Guia Manual 1 Via', '-150'), '');
  assert.strictEqual(app.calcularSoportes('Barra Guia', '-1'), '');
});

console.log(`\n${pass} OK, ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
