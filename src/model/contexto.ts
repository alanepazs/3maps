import { caminoRaizA, type Arbol, type Intercambio } from "./intercambio";

// Armado del contexto que se le manda a la IA. Reglas (CLAUDE.md / spec §4-§5):
//
//  1. SOLO el camino raíz→nodo actual, nunca el árbol entero.
//  2. Cada intercambio se aplana a mensajes user/assistant.
//  3. Ventana: los últimos N intercambios van completos; el tramo más viejo de
//     esa rama se reemplaza por un resumen corto (lo produce una IA barata).
//  4. Prefijo consistente entre llamadas de la misma rama → aprovecha el prompt
//     caching del proveedor. `armarContexto` es determinístico para un
//     (camino, opciones, resumen, relevantes) dado, y el prefijo estable
//     (resumen + ventana) no se toca — lo que cambia por pregunta (el bloque de
//     "intercambios relevantes") va al FINAL, justo antes de la pregunta actual.
//  5. (Fase 2.5, versión liviana) Cuando el tramo viejo se resume, además se
//     rescatan textuales los pocos intercambios viejos que más comparten
//     vocabulario con la pregunta actual — así un dato puntual no se pierde en
//     el resumen. Sin modelo, sin descarga: match por raíces de palabras.
//
// El "lazy loading" de la spec (reconstruir una rama vieja solo al pararse ahí)
// es trivial acá: todo el árbol vive en memoria y `caminoRaizA` es O(profundidad).

export type Rol = "user" | "assistant";
export type Mensaje = { rol: Rol; texto: string };

export type OpcionesContexto = {
  // Cuántos intercambios recientes del camino van completos. Los anteriores se
  // resumen (o van completos si todavía no hay resumen).
  ventana: number;
};

export const DEFAULT_CONTEXTO: OpcionesContexto = { ventana: 6 };

// Un intercambio → 0..2 mensajes. Pregunta o respuesta vacías se omiten (la
// raíz puede tener `## Pregunta` vacía si el árbol arranca de una consigna).
function aplanar(ic: Intercambio): Mensaje[] {
  const out: Mensaje[] = [];
  const p = ic.pregunta.trim();
  const r = ic.respuesta?.trim();
  if (p) out.push({ rol: "user", texto: p });
  if (r) out.push({ rol: "assistant", texto: r });
  return out;
}

// Deja una secuencia válida para la API: arranca en "user" y sin dos mensajes
// seguidos del mismo rol (se concatenan con doble salto de línea).
function normalizar(mensajes: Mensaje[]): Mensaje[] {
  const out: Mensaje[] = [];
  for (const m of mensajes) {
    if (out.length === 0 && m.rol !== "user") {
      out.push({ rol: "user", texto: "(Inicio de la conversación)" });
    }
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.rol === m.rol) {
      ultimo.texto = `${ultimo.texto}\n\n${m.texto}`;
    } else {
      out.push({ rol: m.rol, texto: m.texto });
    }
  }
  return out;
}

// ── Relevancia por raíces de palabras (fase 2.5, versión liviana) ──────────

// Palabras "de contenido" muy comunes en español: no aportan a la relevancia.
const STOPWORDS = new Set([
  "para", "pero", "porque", "como", "cuando", "donde", "esto", "esta", "estos",
  "estas", "este", "eso", "esa", "esos", "esas", "aquel", "todo", "toda", "todos",
  "todas", "algo", "alguno", "alguna", "cada", "otro", "otra", "otros", "otras",
  "mismo", "misma", "muy", "mas", "menos", "tanto", "poco", "mucho", "sobre",
  "entre", "hasta", "desde", "sino", "aunque", "entonces", "tambien", "solo",
  "puede", "pueden", "hacer", "tener", "tiene", "seria", "estar", "quiero",
  "hay", "con", "sin", "por", "los", "las", "una", "unos", "unas", "del", "que",
  "the", "and", "for", "with", "this", "that",
]);

// Raíz aproximada de una palabra en español (para que "horas" matchee "hora",
// "estudiar" matchee "estudio"). Crudo a propósito: saca un sufijo común solo
// si queda una raíz de >=4 letras.
function raiz(w: string): string {
  const sufijos = [
    "aciones", "iciones", "amiento", "imiento", "adores", "adoras",
    "ando", "iendo", "mente", "ciones", "idades", "antes", "entes",
    "ados", "idos", "adas", "idas", "aba", "cion", "dad", "oso", "osa",
    "es", "os", "as", "ar", "er", "ir", "an", "en", "a", "o", "s",
  ];
  for (const s of sufijos) {
    if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  }
  return w;
}

// Raíces significativas de un texto: minúsculas, sin acentos, palabra original
// >=4 letras, sin stopwords.
function raices(texto: string): Set<string> {
  const out = new Set<string>();
  for (const w of texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)) {
    if (w.length >= 4 && !STOPWORDS.has(w)) out.add(raiz(w));
  }
  return out;
}

// Umbral (ponderado por rareza) y cuántos rescatar / largo por intercambio.
const MIN_SCORE = 2;
const MAX_RELEVANTES = 3;
const MAX_CHARS_RELEVANTE = 900;

// De `viejos` (los que van a resumen), los que más vocabulario comparten con
// `pregunta`. Una raíz que aparece en <=1 intercambio viejo pesa doble (señal
// fuerte); las comunes en el tramo pesan menos. Devueltos en orden del camino.
// `[]` si ninguno pasa el umbral.
export function intercambiosRelevantes(
  viejos: Intercambio[],
  pregunta: string,
  k = MAX_RELEVANTES,
): Intercambio[] {
  const clave = raices(pregunta);
  if (clave.size === 0 || viejos.length === 0) return [];

  const raicesDe = viejos.map((ic) =>
    raices(`${ic.pregunta} ${ic.respuesta ?? ""}`),
  );

  const frecuencia = new Map<string, number>();
  for (const set of raicesDe) {
    for (const r of set) frecuencia.set(r, (frecuencia.get(r) ?? 0) + 1);
  }
  const peso = (r: string) => {
    const f = frecuencia.get(r) ?? 0;
    return f <= 1 ? 2 : f === 2 ? 1 : 0.5;
  };

  const puntuados = viejos
    .map((ic, i) => {
      let score = 0;
      for (const r of clave) if (raicesDe[i].has(r)) score += peso(r);
      return { ic, i, score };
    })
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.i - a.i) // score desc, luego recientes
    .slice(0, k)
    .sort((a, b) => a.i - b.i); // volver al orden del camino

  return puntuados.map((x) => x.ic);
}

function recorte(t: string): string {
  return t.length > MAX_CHARS_RELEVANTE
    ? `${t.slice(0, MAX_CHARS_RELEVANTE)}…`
    : t;
}

// Contexto para responder en (o desde) `nodoId`: el camino raíz→nodo aplanado
// a mensajes, recortado con la ventana. Si `nodoId` es un intercambio pendiente
// (sin respuesta), su pregunta queda como último mensaje `user` — listo para
// mandar sin agregar nada.
//
// `resumenViejo`: resumen del tramo anterior a la ventana. `null` → ese tramo
// va completo (fase 1, todavía sin IA que resuma).
// `relevantes`: intercambios viejos a rescatar textuales antes de la pregunta
// actual (ver `intercambiosRelevantes`). Solo se usan si hay resumen (si el
// tramo viejo va completo, ya están).
export function armarContexto(
  arbol: Arbol,
  nodoId: string,
  opts: OpcionesContexto = DEFAULT_CONTEXTO,
  resumenViejo: string | null = null,
  relevantes: Intercambio[] = [],
): Mensaje[] {
  const camino = caminoRaizA(arbol, nodoId);
  if (camino.length === 0) return [];

  const ventana = Math.max(1, Math.floor(opts.ventana));
  const recientes = camino.slice(-ventana);
  const viejos = camino.slice(0, camino.length - recientes.length);

  const crudo: Mensaje[] = [];
  const resumen = resumenViejo?.trim();
  if (viejos.length > 0 && resumen) {
    crudo.push({
      rol: "user",
      texto: `Resumen de la parte previa de esta conversación:\n\n${resumen}`,
    });
    crudo.push({ rol: "assistant", texto: "Listo, lo tengo presente." });
  } else {
    for (const ic of viejos) crudo.push(...aplanar(ic));
  }

  // La ventana, menos el último (que es la pregunta actual / pendiente): así el
  // bloque de "relevantes" queda JUSTO antes de la pregunta, sin partir el
  // prefijo estable.
  const actual = recientes[recientes.length - 1];
  for (const ic of recientes.slice(0, -1)) crudo.push(...aplanar(ic));

  const rescatar = resumen ? relevantes : [];
  if (rescatar.length > 0) {
    const bloque = rescatar
      .map((ic) => `— ${ic.pregunta}\n${recorte((ic.respuesta ?? "").trim())}`)
      .join("\n\n");
    crudo.push({
      rol: "user",
      texto:
        "Estos intercambios anteriores parecen relacionados con lo que voy a " +
        `preguntar (por si el resumen los aplanó):\n\n${bloque}`,
    });
    crudo.push({ rol: "assistant", texto: "Tenido en cuenta." });
  }

  if (actual) crudo.push(...aplanar(actual));

  return normalizar(crudo);
}

// El tramo del camino que cae fuera de la ventana — lo que habría que resumir.
// Vacío si el camino entra entero en la ventana. Lo usará la lógica de resumen.
export function tramoAResumir(
  arbol: Arbol,
  nodoId: string,
  opts: OpcionesContexto = DEFAULT_CONTEXTO,
): Intercambio[] {
  const camino = caminoRaizA(arbol, nodoId);
  const ventana = Math.max(1, Math.floor(opts.ventana));
  return camino.slice(0, Math.max(0, camino.length - ventana));
}
