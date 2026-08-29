import { caminoRaizA, type Arbol, type Intercambio } from "./intercambio";

// Armado del contexto que se le manda a la IA. Reglas (CLAUDE.md / spec §4-§5):
//
//  1. SOLO el camino raíz→nodo actual, nunca el árbol entero.
//  2. Cada intercambio se aplana a mensajes user/assistant.
//  3. Ventana: los últimos N intercambios van completos; el tramo más viejo de
//     esa rama se reemplaza por un resumen corto (lo produce una IA barata más
//     adelante — hasta entonces ese tramo va completo).
//  4. Prefijo consistente entre llamadas de la misma rama → aprovecha el prompt
//     caching del proveedor. `armarContexto` es determinístico para un
//     (camino, opciones, resumen) dado, y el prefijo solo crece al final a
//     medida que la rama avanza.
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

// Contexto para responder en (o desde) `nodoId`: el camino raíz→nodo aplanado
// a mensajes, recortado con la ventana. Si `nodoId` es un intercambio pendiente
// (sin respuesta), su pregunta queda como último mensaje `user` — listo para
// mandar sin agregar nada.
//
// `resumenViejo`: resumen del tramo anterior a la ventana. `null` → ese tramo
// va completo (fase 1, todavía sin IA que resuma).
export function armarContexto(
  arbol: Arbol,
  nodoId: string,
  opts: OpcionesContexto = DEFAULT_CONTEXTO,
  resumenViejo: string | null = null,
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
  for (const ic of recientes) crudo.push(...aplanar(ic));

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
