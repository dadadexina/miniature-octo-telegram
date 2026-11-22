const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return new TextEncoder().encode(String(value ?? ''))
}

function dosDateTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date()
  const year = Math.max(1980, d.getFullYear())
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time: time & 0xffff, date: day & 0xffff }
}

function header(size, write) {
  const bytes = new Uint8Array(size)
  write(new DataView(bytes.buffer))
  return bytes
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export function normalizeEntryName(name) {
  const segments = String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
  return segments.join('/') || 'file'
}

export function createZip(entries, { now = new Date() } = {}) {
  const { time, date } = dosDateTime(now)
  const encoder = new TextEncoder()
  const locals = []
  const centrals = []
  let offset = 0

  for (const entry of entries || []) {
    const name = normalizeEntryName(entry?.name)
    const nameBytes = encoder.encode(name)
    const data = toBytes(entry?.data)
    const checksum = crc32(data)

    const local = header(30, (view) => {
      view.setUint32(0, 0x04034b50, true)
      view.setUint16(4, 20, true)
      view.setUint16(6, 0x0800, true)
      view.setUint16(8, 0, true)
      view.setUint16(10, time, true)
      view.setUint16(12, date, true)
      view.setUint32(14, checksum, true)
      view.setUint32(18, data.length, true)
      view.setUint32(22, data.length, true)
      view.setUint16(26, nameBytes.length, true)
      view.setUint16(28, 0, true)
    })

    locals.push(local, nameBytes, data)

    const central = header(46, (view) => {
      view.setUint32(0, 0x02014b50, true)
      view.setUint16(4, 20, true)
      view.setUint16(6, 20, true)
      view.setUint16(8, 0x0800, true)
      view.setUint16(10, 0, true)
      view.setUint16(12, time, true)
      view.setUint16(14, date, true)
      view.setUint32(16, checksum, true)
      view.setUint32(20, data.length, true)
      view.setUint32(24, data.length, true)
      view.setUint16(28, nameBytes.length, true)
      view.setUint16(30, 0, true)
      view.setUint16(32, 0, true)
      view.setUint16(34, 0, true)
      view.setUint16(36, 0, true)
      view.setUint32(38, 0, true)
      view.setUint32(42, offset, true)
    })

    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }

  const centralBytes = concat(centrals)
  const end = header(22, (view) => {
    view.setUint32(0, 0x06054b50, true)
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, (entries || []).length, true)
    view.setUint16(10, (entries || []).length, true)
    view.setUint32(12, centralBytes.length, true)
    view.setUint32(16, offset, true)
    view.setUint16(20, 0, true)
  })

  return concat([...locals, centralBytes, end])
}
