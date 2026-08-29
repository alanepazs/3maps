"use client";

// Física compartida del "envión" (inercia al soltar), usada tanto para
// arrastrar globos como para mover el plano del fondo con la manito.

// px/ms — velocidad mínima al soltar para que haya envión
export const FLICK_THRESHOLD = 0.35;
// fracción de la velocidad que queda después de 1 segundo (más chico = frena antes)
export const DECAY_PER_SEC = 0.004;
// px/ms — por debajo de esto se considera frenado
export const STOP_SPEED = 0.03;
// ms — tope de dt por frame (pestaña en 2º plano / preview dormido)
export const MAX_FRAME_MS = 40;
// mínimo de muestras de movimiento para considerar que hubo un "flick" real
export const MIN_SAMPLES = 3;

export type VelSample = {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  count: number;
};

// Agrega una muestra de posición y devuelve el sample actualizado, con la
// velocidad suavizada exponencialmente.
export function sampleVelocity(
  prev: VelSample | null,
  x: number,
  y: number,
): VelSample {
  const now = performance.now();
  if (!prev) return { t: now, x, y, vx: 0, vy: 0, count: 0 };
  const dt = now - prev.t;
  if (dt <= 0) return prev;
  const rawVx = (x - prev.x) / dt;
  const rawVy = (y - prev.y) / dt;
  return {
    t: now,
    x,
    y,
    vx: prev.vx * 0.4 + rawVx * 0.6,
    vy: prev.vy * 0.4 + rawVy * 0.6,
    count: prev.count + 1,
  };
}

// Velocidad inicial del glide a partir de la última muestra, o null si no
// corresponde lanzar un envión (poco movimiento, sin flick, etc).
export function launchVelocity(
  sample: VelSample | null,
  strength: number,
  maxSpeed: number,
): { vx: number; vy: number } | null {
  if (strength <= 0 || !sample || sample.count < MIN_SAMPLES) return null;
  const rawSpeed = Math.hypot(sample.vx, sample.vy);
  if (!Number.isFinite(rawSpeed) || rawSpeed <= FLICK_THRESHOLD) return null;

  let vx = sample.vx * strength;
  let vy = sample.vy * strength;
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    const k = maxSpeed / speed;
    vx *= k;
    vy *= k;
  }
  return { vx, vy };
}

// Corre el loop de desaceleración. `apply(dx, dy)` mueve lo que sea (globos o
// viewport) ese delta en cada frame; `onDone` se llama al frenar. Devuelve una
// función para cortar el glide.
export function runGlide(
  vx: number,
  vy: number,
  apply: (dx: number, dy: number) => void,
  onDone: () => void,
): () => void {
  let raf = 0;
  let cancelled = false;
  let lastT = performance.now();

  const step = () => {
    if (cancelled) return;
    const now = performance.now();
    const dt = Math.min(now - lastT, MAX_FRAME_MS);
    lastT = now;

    const decay = Math.pow(DECAY_PER_SEC, dt / 1000);
    vx *= decay;
    vy *= decay;

    if (Math.hypot(vx, vy) < STOP_SPEED) {
      onDone();
      return;
    }

    apply(vx * dt, vy * dt);
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
