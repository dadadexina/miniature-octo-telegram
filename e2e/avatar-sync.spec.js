import { expect, test } from '@playwright/test'

test.describe.configure({ timeout: 180_000, mode: 'serial' })

const A = {
  email: process.env.E2E_USER_A_EMAIL,
  password: process.env.E2E_USER_A_PASSWORD,
  username: process.env.E2E_USER_A_USERNAME,
}
const B = {
  email: process.env.E2E_USER_B_EMAIL,
  password: process.env.E2E_USER_B_PASSWORD,
  username: process.env.E2E_USER_B_USERNAME,
}

const hasLogin = Boolean(A.email && A.password && B.email && B.password)
const hasUsernames = Boolean(A.username && B.username)

// 两张不同的 1x1 PNG,用于确认头像 URL 确实换成了新上传的文件
const PNG_ONE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
)
const PNG_TWO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAAH/3J1cQwAAAABJRU5ErkJggg==',
  'base64'
)

async function login(page, user) {
  await page.goto('/login')
  await page.getByPlaceholder('name@example.com').fill(user.email)
  await page.getByPlaceholder('至少 6 位').fill(user.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/chats$/, { timeout: 30000 })
}

async function changeAvatar(page, buffer) {
  await page.goto('/profile/edit')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer,
  })
  const save = page.getByRole('button', { name: '保存', exact: true })
  await expect(save).toBeEnabled({ timeout: 20000 })
  await save.click()
  await expect(page).toHaveURL(/\/me$/, { timeout: 30000 })
}

function friendEntry(page, username) {
  return page.getByTestId('friend-entry').filter({ hasText: `ID: ${username}` }).first()
}

test.describe('好友头像同步', () => {
  test.skip(!hasLogin || !hasUsernames, '需要 E2E_USER_A/B 凭据')

  test('B 更换头像后 A 实时可见;A 离线期间换头像,恢复在线后立即同步', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)

    await pageA.goto('/contacts')
    const entryA = friendEntry(pageA, B.username)
    await expect(entryA).toBeVisible({ timeout: 30000 })

    // 场景一:A 在线,B 上传新头像 → A 端头像 URL 变化
    const srcBefore = await entryA
      .locator('img')
      .getAttribute('src')
      .catch(() => null)
    await changeAvatar(pageB, PNG_ONE)
    await expect
      .poll(
        async () => {
          const src = await entryA.locator('img').getAttribute('src').catch(() => '')
          return src && src !== srcBefore ? src : ''
        },
        { timeout: 30000 }
      )
      .toContain('avatar-')
    const srcAfterFirst = await entryA.locator('img').getAttribute('src')

    // 场景二:A 离线期间 B 再换头像,A 恢复在线后补拉最新头像
    await ctxA.setOffline(true)
    await pageA.waitForTimeout(2000)
    await changeAvatar(pageB, PNG_TWO)
    await pageA.waitForTimeout(1500)
    expect(await entryA.locator('img').getAttribute('src')).toBe(srcAfterFirst)

    await ctxA.setOffline(false)
    await expect
      .poll(async () => entryA.locator('img').getAttribute('src').catch(() => ''), { timeout: 40000 })
      .not.toBe(srcAfterFirst)

    await ctxA.close()
    await ctxB.close()
  })
})
