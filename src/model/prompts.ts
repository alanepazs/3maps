"use client";

// Prompts de sistema: unos de fábrica + los que el usuario guarda. Los guardados
// viven en `localStorage["3maps:prompts"]` (local a este navegador — no sincronizan
// entre dispositivos por ahora; el prompt ACTIVO sí, en `settings.systemPrompt`).

export type Prompt = { nombre: string; texto: string };

export const PROMPTS_PRESET: readonly Prompt[] = [
  {
    nombre: "Conciso en español",
    texto:
      "Respondé en español, directo y sin relleno. Nada de introducciones ni " +
      "resúmenes al final. Ecuaciones entre $$ … $$.",
  },
  {
    nombre: "Tutor paso a paso",
    texto:
      "Sos un tutor paciente. Explicá paso a paso, con un ejemplo concreto en " +
      "cada paso, y frená a chequear que se entienda antes de avanzar. En español.",
  },
  {
    nombre: "Solo código",
    texto:
      "Respondé solo con el código pedido. Sin explicación salvo que la pidan. " +
      "Comentarios mínimos y en el idioma del código de alrededor.",
  },
  {
    nombre: "Lluvia de ideas",
    texto:
      "Antes de recomendar, tirá varias opciones distintas. Marcá los supuestos " +
      "y los tradeoffs de cada una. Recién al final, una recomendación. En español.",
  },
];

const KEY = "3maps:prompts";
const MAX = 20;

export function leerPromptsMios(): Prompt[] {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (p): p is Prompt =>
          !!p &&
          typeof p === "object" &&
          typeof (p as Prompt).nombre === "string" &&
          typeof (p as Prompt).texto === "string",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function escribir(ps: Prompt[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ps.slice(0, MAX)));
  } catch {
    /* ignorar */
  }
}

// Guarda (o reemplaza por nombre) y devuelve la lista nueva.
export function guardarPromptMio(nombre: string, texto: string): Prompt[] {
  const n = nombre.trim();
  if (!n) return leerPromptsMios();
  const ps = leerPromptsMios().filter((p) => p.nombre !== n);
  ps.unshift({ nombre: n, texto });
  escribir(ps);
  return ps;
}

export function borrarPromptMio(nombre: string): Prompt[] {
  const ps = leerPromptsMios().filter((p) => p.nombre !== nombre);
  escribir(ps);
  return ps;
}
