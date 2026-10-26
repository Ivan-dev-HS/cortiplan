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
      codigo: 'CORTOP', caida: '', soporte: 'T', soporteAlt: '',
      soporteConflicto: false, esTapiceria: false,
      ondaCm: '8cm', apertura: '', mandoBrisa: '', colorGuia: 'BCO',
      motorizada: false, pestana: '',
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
      caida: '', soporte: 'RAP', soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
      motorizada: false, pestana: '',
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
      soporte: 'RAP', soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
      motorizada: false, pestana: '',
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
      soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '3', mandoBrisa: '',
      colorGuia: 'BCO',
      motorizada: false, pestana: '',
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
      caida: '', soporte: 'T', soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
      motorizada: false, pestana: '',
    }],
  },
  {
    // Caso real: enrollable motorizado ("MOTOR: D" en vez de "MANDO:"/"RECOG:")
    // con tejido cuya composición incluye un "%" ("SUPER NILO 3%"), que antes
    // rompía la extracción del tejido (quedaba vacío) y nunca marcaba
    // "motorizada" (siempre salía como Manual aunque el presupuesto dijera
    // MOTORIZADA).
    name: 'Enrollable motorizado con tejido con "%" en la composición',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. G700 CLIENTE SIETE',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'ESCALA 1,00',
      'N04MO43 MEDIDA:99x220H - MOTOR: D -CAIDA: DEL - SOP.T 1,00 973,00 973,00',
      'UD. CORTINA ENROLLABLE MOTORIZADA SISTEMA MEDIUM',
      '(T43)-TEJIDO SUPER NILO 3% N04 BLANCO/GRIS. SOP.GRIS',
    ].join('\n'),
    expected: [{
      estancia: 'ESCALA', ancho: '99', alto: '220', hojas: '1', extra: '',
      metros: '1.98', recogida: 'D', tejido: 'SUPER NILO 3% N04',
      sistema: 'Ø 43mm', tipo: 'Enrollable', codigo: 'N04MO43', caida: 'DEL',
      soporte: 'T', soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
      motorizada: true, pestana: '',
    }],
  },
  {
    // Mismo tejido con "%", pero mando a cadena manual (no motor) y el
    // tejido partido en dos líneas del PDF ("...ANTRACITA." / "SOP.GRIS"):
    // no debe marcarse motorizada, y el "SOP.GRIS" de la línea siguiente no
    // debe colarse dentro del tejido.
    name: 'Enrollable manual (mando a cadena) con tejido con "%"',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. G701 CLIENTE OCHO',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'DESPATX 1,00',
      'N05CA43 MEDIDA: 256x160H - MANDO: IZ -CAIDA: DEL- SOP:T 1,00 514,00 514,00',
      'UD. CORTINA ENROLLABLE MANDO A CADENA SISTEMA',
      'MEDIUM (T43)-TEJIDO SUPER NILO 3% N05 ANTRACITA.',
      'SOP.GRIS',
    ].join('\n'),
    expected: [{
      estancia: 'DESPATX', ancho: '256', alto: '160', hojas: '1', extra: '',
      metros: '5.12', recogida: 'IZQ', tejido: 'SUPER NILO 3% N05 ANTRACITA',
      sistema: 'Ø 43mm', tipo: 'Enrollable', codigo: 'N05CA43', caida: 'DEL',
      soporte: 'T', soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
      motorizada: false, pestana: '',
    }],
  },
  {
    // Caso real: el PDF corta la descripción del tejido justo tras el primer
    // punto ("TEJIDO SUPREM HELIOS." / "PH01 BLANCO. SOPORTE TECHO CLIC." en
    // la línea siguiente); antes se perdía la referencia/color ("PH01
    // BLANCO") que sigue en la línea de después.
    name: 'Vertical con el nombre del tejido partido en dos líneas',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. G702 CLIENTE NUEVE',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'MENJADOR 1,00',
      'VERT89PH01 MEDIDA:137x247H RECOGIDO:Nº 2 COLOR GUIA:BCO 1,00 391,00 391,00',
      'CORTINA VERTICAL DE LAMA DE 89. TEJIDO SUPREM HELIOS.',
      'PH01 BLANCO. SOPORTE TECHO CLIC.',
    ].join('\n'),
    expected: [{
      estancia: 'MENJADOR', ancho: '137', alto: '247', hojas: '1', extra: '',
      metros: '2.74', recogida: 'D', tejido: 'SUPREM HELIOS PH01 BLANCO',
      sistema: '', tipo: 'Vertical', codigo: 'VERT89PH01', caida: '',
      soporte: 'T CLIC', soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '2',
      mandoBrisa: '', colorGuia: 'BCO',
      motorizada: false, pestana: '',
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
      caida: '', soporte: 'T', soporteAlt: '', soporteConflicto: false,
      esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: 'BCO',
      motorizada: false, pestana: '',
    }],
  },
  {
    // Caso real: el campo compacto de la línea MEDIDA ("SOP:T") es solo un
    // valor por defecto del propio PDF, mientras que la descripción trae el
    // dato real y más detallado ("CON SOPORTE RAPIDO COLOR NEGRO"). Al no
    // coincidir, debe mandar la descripción (soporte) y guardarse el valor
    // del artículo aparte (soporteAlt) con soporteConflicto=true, para que la
    // ficha avise y deje elegir. La línea suelta "SOP.BLANCO" (ruido real de
    // este mismo PDF, como el "SOP.GRIS" de otro caso) no debe colarse ni
    // como soporte ni dentro del tejido.
    name: 'Enrollable con soporte en conflicto entre el artículo (SOP:T) y la descripción (SOPORTE RAPIDO COLOR NEGRO)',
    txt: [
      'PRESUPUESTO DE VENTA',
      'REF. H800 CLIENTE DIEZ',
      'ARTÍCULO DESCRIPCIÓN CANTIDAD PRECIO',
      'CUINA 1,00',
      'LIE02CA43 MEDIDA: 73x222ACB - MANDO: D -CAIDA: DEL- SOP:T 1,00 245,00 245,00',
      'UD. CORTINA ENROLLABLE MANDO A CADENA SISTEMA MEDIUM',
      'A CADENA (T43), TEJIDO LIENA LIE02 BLANCO/LINO.',
      'SOP.BLANCO',
      'CON SOPORTE RAPIDO COLOR NEGRO',
    ].join('\n'),
    expected: [{
      estancia: 'CUINA', ancho: '73', alto: '222', hojas: '1', extra: 'ACB',
      metros: '1.46', recogida: 'D', tejido: 'LIENA LIE02 BLANCO/LINO',
      sistema: 'Ø 43mm', tipo: 'Enrollable', codigo: 'LIE02CA43', caida: 'DEL',
      soporte: 'RAP COLOR NEGRO', soporteAlt: 'T', soporteConflicto: true,
      esTapiceria: false, ondaCm: '', apertura: '',
      mandoBrisa: '', colorGuia: '',
      motorizada: false, pestana: '',
    }],
  },
];
