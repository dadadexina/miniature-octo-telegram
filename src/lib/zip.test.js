import { describe, expect, it } from 'vitest'
import { crc32, createZip, normalizeEntryName } from './zip'

function parseZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const files = []
  let offset = 0
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const checksum = view.getUint32(offset + 14, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    files.push({
      name: decoder.decode(bytes.slice(nameStart, dataStart)),
      checksum,
      data: bytes.slice(dataStart, dataStart + size),
    })
    offset = dataStart + size
  }
  const endOffset = bytes.length - 22
  return { files, total: view.getUint16(endOffset + 10, true), centralOffset: view.getUint32(endOffset + 16, true) }
}

describe('zip', () => {
  it('计算 CRC32 标准校验值', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('生成可解析的存储式 zip', () => {
    const bytes = createZip(
      [
        { name: 'data.json', data: '{}' },
        { name: 'media/a.txt', data: new Uint8Array([1, 2, 3]) },
      ],
      { now: new Date('2026-11-22T10:00:00Z') }
    )
    const parsed = parseZip(bytes)
    expect(parsed.total).toBe(2)
    expect(parsed.files.map((file) => file.name)).toEqual(['data.json', 'media/a.txt'])
    expect(new TextDecoder().decode(parsed.files[0].data)).toBe('{}')
    expect([...parsed.files[1].data]).toEqual([1, 2, 3])
    expect(parsed.files[1].checksum).toBe(crc32(new Uint8Array([1, 2, 3])))
    expect(parsed.centralOffset).toBeGreaterThan(0)
  })

  it('空压缩包也带结束记录', () => {
    const parsed = parseZip(createZip([]))
    expect(parsed.total).toBe(0)
    expect(parsed.files).toEqual([])
  })

  it('清洗路径中的穿越片段', () => {
    expect(normalizeEntryName('../../etc/passwd')).toBe('etc/passwd')
    expect(normalizeEntryName('/media//a.png')).toBe('media/a.png')
    expect(normalizeEntryName('')).toBe('file')
  })
})
