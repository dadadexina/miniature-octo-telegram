import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function readTemplate(file, name) {
  const src = readFileSync(resolve(root, file), 'utf8')
  const marker = `export const ${name} = \``
  const start = src.indexOf(marker)
  if (start === -1) throw new Error(`未找到 ${name}（${file}）`)
  const bodyStart = start + marker.length
  let depth = 0
  for (let i = bodyStart; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '$' && src[i + 1] === '{') {
      depth += 1
      i += 1
      continue
    }
    if (ch === '}' && depth > 0) {
      depth -= 1
      continue
    }
    if (ch === '`' && depth === 0) return src.slice(bodyStart, i)
  }
  throw new Error(`未闭合模板：${name}（${file}）`)
}

const cloud = readTemplate('src/lib/sql.js', 'CLOUD_SQL')
const friends = readTemplate('src/lib/friends.js', 'FRIENDS_SQL')
const clientErrors = readTemplate('src/lib/telemetry.js', 'CLIENT_ERRORS_SQL')
const upgrade = readTemplate('src/lib/schema_v2.js', 'UPGRADE_SQL')

const sql = cloud
  .replaceAll('${FRIENDS_SQL}', () => friends)
  .replaceAll('${CLIENT_ERRORS_SQL}', () => clientErrors)
  .replaceAll('${UPGRADE_SQL}', () => upgrade)

if (/\$\{/.test(sql)) throw new Error('导出结果仍残留未解析插值')

const header = [
  '-- 纸墨信笺 · Supabase 云初始化基线快照',
  '-- 由 scripts/export-cloud-sql.mjs 从 src/lib 下的 SQL 常量生成，勿手工编辑。',
  '-- 用法：整段复制到 Supabase SQL Editor 执行；脚本幂等，可重复运行。',
  '',
  '',
].join('\n')

const outDir = resolve(root, 'supabase/migrations')
mkdirSync(outDir, { recursive: true })
const outFile = resolve(outDir, '0001_baseline.sql')
writeFileSync(outFile, `${header}${sql}\n`)
console.log(`已生成 ${outFile}（${sql.length} 字符）`)
