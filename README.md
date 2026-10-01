# Cool Pharmacy Simulator

Simulador web de **señal luminosa de farmacia** (la cruz verde): modelos de señal, animaciones
prediseñadas y personalizadas, dibujo fotograma a fotograma y vista 3D. Todo en HTML + JavaScript puro,
sin compilación.

## Cómo usarlo

Los módulos ES necesitan servirse por HTTP (no vale abrir el archivo con `file://`):

```bash
npx serve .          # o:  python3 -m http.server 8000
```

Es un sitio estático. Para publicarlo en GitHub Pages: *Settings → Pages → Source: GitHub Actions*; el
workflow `.github/workflows/pages.yml` lo despliega en cada push a `main`.

## Qué incluye

**8 modelos de señal**, de básicos a profesionales

| Modelo | LED | Zonas |
|---|---|---|
| Clásica Verde | un color (verde) | 1 |
| Ámbar Retro | un color (ámbar) | 1 |
| Bicolor Verde/Rojo | verde + rojo (+ ámbar por mezcla) | 1 |
| Cruz RGB Pro | RGB | 2 (borde / interior) |
| Neón Doble Contorno | RGB | 2 (tubo exterior / interior) |
| Anillo Pharma | RGB | 2 (anillo / cruz) |
| Cruz Pixel 30×30 | RGB matriz | 1 |
| Pantalla Matriz 64×16 | RGB matriz, texto y reloj | 1 |

Los modelos de un solo color solo ofrecen animaciones de brillo; las que generan color
(arcoíris, plasma…) aparecen solo en los RGB.

**Animaciones** prediseñadas en 5 grupos (básicas, movimiento, color, efectos y las tuyas).

**Animaciones propias** (pestaña *Estudio*):
- Editor de código: una función `(x, y, i, t, a, L, c1, c2, c3)` que devuelve el color de cada LED
  (`[r,g,b]`, `"#rrggbb"` o brillo 0-1). Se compila y se ve en directo; los errores se muestran al instante.
- Secuenciador: encadena escenas con duración propia, carga programas de ejemplo y exporta/importa JSON.

**Vista 2D y 3D** (three.js): montaje en fachada, bandera o tótem, cámara orbital, bloom, luz que ilumina
la pared con los colores de cada zona de la señal, selector noche/día, captura PNG y pantalla completa (tecla `F`).

**Fotograma a fotograma** (pestaña *Fotogramas*): dibuja cada fotograma encendiendo los LED uno a uno
(clic o arrastrar; clic derecho borra), con tira de fotogramas, duplicar/mover, deshacer y previsualización.

**Texto personalizable**: con el efecto *Texto / Reloj* en la pantalla matriz, escribe tu mensaje en el panel
de la animación (hay frases rápidas). Cada escena del secuenciador guarda su propio texto.

## Estructura

```
index.html        interfaz
css/style.css
js/models.js      geometría y tipo de LED de cada señal
js/effects.js     animaciones + compilador de animaciones propias
js/engine.js      calcula el color de cada LED por fotograma
js/frames.js      editor fotograma a fotograma
js/view2d.js      render canvas 2D
js/view3d.js      render three.js
js/ui.js, main.js interfaz, estado y bucle principal
vendor/           three.js r160 (MIT) incluido para funcionar sin CDN
```

Para añadir un modelo: una entrada en `MODELS` (`js/models.js`). Para añadir un efecto: un objeto en
`EFFECTS` (`js/effects.js`) con su función `px(L, c, o)`.
