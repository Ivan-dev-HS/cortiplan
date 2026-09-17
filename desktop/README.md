# CortiPlan – versión de escritorio (Electron)

Empaqueta la app web de la raíz del repositorio (`../index.html`) tal cual,
sin modificarla, en un `.exe` instalable para Windows que funciona sin
conexión a internet (salvo el OCR de respaldo de Tesseract, que sigue
necesitando internet — ver comentario al principio de `main.js`).

No es un proyecto aparte con su propia copia del código: en cada arranque o
build, `main.js` sirve directamente los ficheros de la raíz del repositorio
(o su copia empaquetada). Cualquier cambio en `index.html` se refleja aquí
automáticamente, sin tener que tocar nada de esta carpeta.

## Probar en desarrollo

```bash
cd desktop
npm install
npm start
```

Abre una ventana de escritorio con la app tal y como está en `../index.html`
en ese momento (no hace falta build ni copia).

## Generar el instalador .exe

```bash
cd desktop
npm install
npm run dist
```

El instalador queda en `desktop/dist/`. Se distribuye ese `.exe` a los
ordenadores de los clientes; no requiere instalar Node ni Electron por
separado, el instalador lo lleva todo incluido.

## Instalador ya compilado

En `desktop/release/CortiPlan-Setup-1.0.0.exe` hay una versión ya
compilada, lista para descargar directamente del repositorio y repartir a
los clientes sin tener que instalar Node ni ejecutar ningún comando.

Ojo: es un binario de ~76 MB commiteado tal cual en el repositorio (no como
adjunto de una Release de GitHub), así que cada vez que se regenere con una
versión nueva, esa copia anterior se queda igualmente en el historial de
git para siempre — el repositorio va engordando con cada actualización.
Si en algún momento eso se vuelve un problema (clonar el proyecto empieza a
pesar mucho), la alternativa es subirlo como adjunto de una Release de
GitHub en vez de commitearlo aquí.

## Cómo funciona (por si hay que tocarlo)

- `main.js` levanta un pequeño servidor HTTP local (`http://127.0.0.1:<puerto>`)
  que sirve la app — necesario para que el Service Worker de la app pueda
  registrarse (un origen `file://` no lo permite).
- Intercepta las peticiones que `index.html` hace a los CDN externos
  (`cdnjs.cloudflare.com/.../pdf.js`, `.../pdf-lib`) y las redirige a copias
  locales en `vendor/`, generadas en el build a partir de los paquetes npm
  `pdfjs-dist` y `pdf-lib` (mismas versiones exactas que usa `index.html`).
- `scripts/copy-app.js` solo se usa para el build final (`npm run dist`):
  copia los ficheros estáticos de la raíz del repo a `app/` para que
  `electron-builder` los empaquete. En desarrollo (`npm start`) no hace
  falta, `main.js` lee `../index.html` directamente.

## Actualizar la versión de pdf.js / pdf-lib

Si `index.html` cambia de versión de alguna de las dos librerías, actualiza
el número de versión en `package.json` (`devDependencies`) y en el mapa
`vendorRedirects()` de `main.js`, para que sigan coincidiendo.
