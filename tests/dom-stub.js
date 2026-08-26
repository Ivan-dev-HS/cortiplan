'use strict';
/* DOM mínimo para poder cargar y ejecutar el <script> de index.html en Node,
   sin depender de un navegador ni de librerías externas (jsdom, etc.).
   Solo implementa lo que la app toca al arrancar y al parsear texto:
   getElementById/createElement con nodos "que tragan cualquier cosa"
   (cualquier propiedad leída/escrita se guarda o se ignora sin explotar). */

function makeFakeNode() {
  const backing = {
    value: '', textContent: '', innerHTML: '', className: '', checked: false,
    style: {}, dataset: {}, files: [],
    scrollTop: 0, scrollHeight: 0, clientHeight: 0, scrollWidth: 0, clientWidth: 0,
  };
  const classSet = new Set();
  const classList = {
    add: (...c) => c.forEach(x => classSet.add(x)),
    remove: (...c) => c.forEach(x => classSet.delete(x)),
    toggle: (c, force) => { const on = force === undefined ? !classSet.has(c) : !!force; on ? classSet.add(c) : classSet.delete(c); return on; },
    contains: c => classSet.has(c),
  };
  const noop = () => {};
  const returnsNode = () => makeFakeNode();
  const returnsNull = () => null;
  const returnsList = () => [];
  const methodMap = {
    addEventListener: noop, removeEventListener: noop,
    appendChild: a => a, insertBefore: a => a, removeChild: a => a, remove: noop,
    querySelector: returnsNull, querySelectorAll: returnsList, closest: returnsNull,
    getAttribute: returnsNull, setAttribute: noop, removeAttribute: noop,
    getContext: returnsNode, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    focus: noop, click: noop, scrollTo: noop, cloneNode: returnsNode,
  };
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'classList') return classList;
      if (prop === 'style') return backing.style;
      if (prop === 'dataset') return backing.dataset;
      if (prop in methodMap) return methodMap[prop];
      if (prop in backing) return backing[prop];
      if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') return () => '';
      return returnsNode; // cualquier otro método desconocido: no-op que devuelve un nodo fake
    },
    set(_t, prop, val) { backing[prop] = val; return true; },
  });
}

function makeFakeDocument() {
  const byId = new Map();
  return {
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeFakeNode());
      return byId.get(id);
    },
    createElement: () => makeFakeNode(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    documentElement: makeFakeNode(),
    head: makeFakeNode(),
    body: makeFakeNode(),
    styleSheets: [],
  };
}

/* Construye un sandbox de vm con todo lo que index.html necesita para
   cargar sin lanzar excepciones, y devuelve el contexto ya ejecutado
   (con todas las funciones/const de nivel superior colgadas de él). */
function loadAppScript(scriptSource) {
  const vm = require('vm');
  const fakeDocument = makeFakeDocument();
  const fakeWindow = {};
  const localStorageStore = {};
  const sandbox = {
    window: fakeWindow,
    document: fakeDocument,
    navigator: { onLine: true },
    localStorage: {
      getItem: k => (k in localStorageStore ? localStorageStore[k] : null),
      setItem: (k, v) => { localStorageStore[k] = String(v); },
      removeItem: k => { delete localStorageStore[k]; },
    },
    pdfjsLib: { GlobalWorkerOptions: {} },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: cb => setTimeout(cb, 0),
    fetch: () => Promise.reject(new Error('fetch no disponible en el harness de tests')),
    alert: () => {},
    confirm: () => true,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox, { filename: 'index.html#script' });
  return sandbox;
}

/* Extrae el <script> principal (el que contiene 'use strict' y toda la
   lógica de la app) del index.html del repositorio. */
function extractMainScript(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const main = blocks.find(b => b.includes("'use strict'"));
  if (!main) throw new Error('No se ha encontrado el <script> principal en index.html');
  return main;
}

module.exports = { loadAppScript, extractMainScript, makeFakeNode, makeFakeDocument };
