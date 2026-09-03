// ZIP mínimo, sin dependencias (3maps se mantiene vanilla). Escribe con método
// STORE (sin compresión — los `.md` son texto chico); lee STORE y DEFLATE (este
// último con `DecompressionStream` nativo del navegador, así un `.zip` hecho en
// cualquier lado también importa). Usado por `traspaso.ts` (export/import de
// mapas, spec §7).

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// `archivos` = { "nombre.md": "contenido", ... } → bytes del `.zip`.
export function crearZip(archivos: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const nombres = Object.keys(archivos);
  const locales: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const nombre of nombres) {
    const nb = enc.encode(nombre);
    const datos = enc.encode(archivos[nombre]);
    const crc = crc32(datos);

    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034b50, true); // firma
    lfh.setUint16(4, 20, true); // version needed
    lfh.setUint16(6, 0x0800, true); // flag: nombre en UTF-8
    lfh.setUint16(8, 0, true); // método: STORE
    lfh.setUint16(10, 0, true); // hora
    lfh.setUint16(12, 0x21, true); // fecha (1980-01-01)
    lfh.setUint32(14, crc, true);
    lfh.setUint32(18, datos.length, true); // comprimido
    lfh.setUint32(22, datos.length, true); // sin comprimir
    lfh.setUint16(26, nb.length, true);
    lfh.setUint16(28, 0, true); // extra
    const lfhB = new Uint8Array(lfh.buffer);
    locales.push(lfhB, nb, datos);

    const cdh = new DataView(new ArrayBuffer(46));
    cdh.setUint32(0, 0x02014b50, true);
    cdh.setUint16(4, 20, true); // version made by
    cdh.setUint16(6, 20, true); // version needed
    cdh.setUint16(8, 0x0800, true);
    cdh.setUint16(10, 0, true);
    cdh.setUint16(12, 0, true);
    cdh.setUint16(14, 0x21, true);
    cdh.setUint32(16, crc, true);
    cdh.setUint32(20, datos.length, true);
    cdh.setUint32(24, datos.length, true);
    cdh.setUint16(28, nb.length, true);
    cdh.setUint32(42, offset, true); // offset del local header
    central.push(new Uint8Array(cdh.buffer), nb);

    offset += lfhB.length + nb.length + datos.length;
  }

  let centralLen = 0;
  for (const c of central) centralLen += c.length;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, nombres.length, true);
  eocd.setUint16(10, nombres.length, true);
  eocd.setUint32(12, centralLen, true);
  eocd.setUint32(16, offset, true); // inicio del central directory

  const trozos = [...locales, ...central, new Uint8Array(eocd.buffer)];
  let total = 0;
  for (const t of trozos) total += t.length;
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) {
    salida.set(t, pos);
    pos += t.length;
  }
  return salida;
}

async function inflar(comp: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([comp as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Bytes del `.zip` → { "nombre": "contenido" }. Ignora carpetas. Lanza si no
// es un `.zip` o si un archivo usa un método de compresión raro.
export async function leerZip(
  bytes: Uint8Array,
): Promise<Record<string, string>> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();

  // El "end of central directory" está al final; se escanea hacia atrás.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no es un .zip válido.");

  const nEntradas = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: Record<string, string> = {};

  for (let n = 0; n < nEntradas; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    const lNameLen = dv.getUint16(lho + 26, true);
    const lExtraLen = dv.getUint16(lho + 28, true);
    const ini = lho + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(ini, ini + compSize);

    if (!nombre.endsWith("/")) {
      let datos: Uint8Array;
      if (metodo === 0) datos = comp;
      else if (metodo === 8) datos = await inflar(comp);
      else throw new Error(`Compresión no soportada en "${nombre}" (${metodo}).`);
      out[nombre] = dec.decode(datos);
    }

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
