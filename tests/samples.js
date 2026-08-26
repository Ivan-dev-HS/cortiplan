'use strict';
/* Bloques de texto representativos de presupuestos Canotex (sintéticos, no
   datos reales de clientes) usados por run-parser-tests.js como banco de
   pruebas de regresión del parser: si un cambio futuro en estrategiaCanotex
   u otras heurísticas rompe alguno de estos casos, el test lo detecta. */
module.exports = [
  {
    name: 'Onda Perfecta (CORTOP)',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. A691 CLIENTE PRUEBA',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'COMEDOR 1,00',
      'CORTOP MEDIDA:150X250H CONFE:1 HOJAS RECOG:D COLOR GUIA:BCO',
      'UD. CONFECCION ONDA PERFECTA (ONDA 8CM)',
      'TEJIDO: SAURA C/02',
      'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA, REFORZADA',
    ].join('\n'),
    expected: [{
      estancia: 'COMEDOR', ancho: '150', alto: '250', hojas: '1', extra: '',
      metros: '3.60', recogida: 'D', tejido: 'SAURA C/02',
      sistema: 'GUIA MANUAL 1 VIA, REFORZADA', tipo: 'Onda Perfecta',
      codigo: 'CORTOP', caida: '', soporte: 'T', esTapiceria: false,
      ondaCm: '8cm', apertura: '', mandoBrisa: '', colorGuia: 'BCO',
    }],
  },
  {
    name: 'Paquetto',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. B120 CLIENTE DOS',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'BAÑO 1,00',
      'PAQUETTO MEDIDA:100X200H MANDO: D SOP:RAP',
      'TEJIDO: LISO BLANCO',
    ].join('\n'),
    expected: [{
      estancia: 'BAÑO', ancho: '100', alto: '200', hojas: '1', extra: '',
      metros: '1.40', recogida: 'D', tejido: 'LISO BLANCO',
      sistema: 'Mando cadena derecha', tipo: 'Paquetto', codigo: 'PAQUETTO',
      caida: '', soporte: 'RAP', esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
    }],
  },
  {
    name: 'Enrollable (P05)',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. C300 CLIENTE TRES',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'SALON 1,00',
      'P05C12 MEDIDA:120X180H MANDO: D SOP:RAP CAIDA:DEL',
      'CADENA (T43), TEJIDO THECNIC BASIC P05 BLANCO/GRIS.',
      'SISTEMA MEDIUM',
    ].join('\n'),
    expected: [{
      estancia: 'SALON', ancho: '120', alto: '180', hojas: '1', extra: '',
      metros: '2.40', recogida: 'D', tejido: 'THECNIC BASIC P05 BLANCO/GRIS',
      sistema: 'Ø 43mm', tipo: 'Enrollable', codigo: 'P05C12', caida: 'DEL',
      soporte: 'RAP', esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
    }],
  },
  {
    name: 'Vertical',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. D410 CLIENTE CUATRO',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'DESPACHO 1,00',
      'VERT01 MEDIDA:200X220H RECOGIDO:Nº 3 COLOR GUIA:BCO',
      'UD. CONFECCION VERTICAL LAMA 89MM',
      'TEJIDO: SCREEN GRIS',
    ].join('\n'),
    expected: [{
      estancia: 'DESPACHO', ancho: '200', alto: '220', hojas: '1', extra: '',
      metros: '4.00', recogida: 'D', tejido: 'SCREEN GRIS', sistema: '',
      tipo: 'Vertical', codigo: 'VERT01', caida: '', soporte: 'T',
      esTapiceria: false, ondaCm: '', apertura: '3', mandoBrisa: '',
      colorGuia: 'BCO',
    }],
  },
  {
    // Caso real: algunos presupuestos usan una sola letra en MANDO ("I"/"D"),
    // no solo "IZQ"/"IZQUIERDA" — ver normalizeRecogida.
    name: 'Paquetto con mando a una sola letra (MANDO:I)',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. F600 CLIENTE SEIS',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'CUINA 1,00',
      'PAQUETTO MEDIDA: 145X122T.T -MANDO:I 1,00',
      'UD. ESTOR TIPO PAQUETTO CON MANDO A CADENA OCULTO.',
      'TEJIDO: BEGUR 02 NACAR.',
    ].join('\n'),
    expected: [{
      estancia: 'CUINA', ancho: '145', alto: '122', hojas: '1', extra: 'T.T',
      metros: '1.85', recogida: 'IZQ', tejido: 'BEGUR 02 NACAR.',
      sistema: 'Mando cadena izquierda', tipo: 'Paquetto', codigo: 'PAQUETTO',
      caida: '', soporte: 'T', esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
    }],
  },
  {
    name: 'Dos hojas con recogida central',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. E500 CLIENTE CINCO',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'DORMITORIO 1,00',
      'CORTPLA MEDIDA:300X250H CONFE:2 HOJAS RECOG:CEN COLOR GUIA:BCO',
      'UD. CONFECCION PLANA',
      'TEJIDO: LINO CRUDO',
      'SISTEMA DE INSTALACION: GUIA MANUAL 1 VIA',
    ].join('\n'),
    expected: [{
      estancia: 'DORMITORIO', ancho: '300', alto: '250', hojas: '2', extra: '',
      metros: '4.20', recogida: 'CEN', tejido: 'LINO CRUDO',
      sistema: 'GUIA MANUAL 1 VIA', tipo: 'Plana', codigo: 'CORTPLA',
      caida: '', soporte: 'T', esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: 'BCO',
    }],
  },
];
