import { expect, test } from '@playwright/test'

test.describe.configure({ timeout: 120_000 })

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

async function login(page, user) {
  await page.goto('/login')
  await page.getByPlaceholder('name@example.com').fill(user.email)
  await page.getByPlaceholder('至少 6 位').fill(user.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/chats$/, { timeout: 30000 })
}

async function ensureFriend(page, username) {
  await page.goto('/contacts')
  const search = page.getByPlaceholder('输入用户名 ID 搜索')
  await search.fill(username)
  await search.press('Enter')
  const results = page.getByTestId('search-results')
  await expect(results).toBeVisible({ timeout: 20000 })
  const addBtn = results.getByTestId('search-result-add').first()
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click()
    await expect(results.getByText('已添加')).toBeVisible({ timeout: 10000 })
  }
}

async function openChatByUsername(page, username) {
  await page.goto('/contacts')
  const link = page.getByTestId('friend-entry').filter({ hasText: `ID: ${username}` }).first()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click()
  await expect(page.getByPlaceholder('发送消息')).toBeVisible({ timeout: 20000 })
}

async function sendMessage(page, text) {
  await page.getByPlaceholder('发送消息').fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText(text).last()).toBeVisible({ timeout: 20000 })
}

test.describe('云端双人聊天流（需 E2E_USER_A/B 凭据）', () => {
  test.skip(!hasLogin, '未配置 E2E_USER_A/B 邮箱密码，跳过云端 e2e')

  test('A、B 均可登录并到达会话列表', async ({ browser }) => {
    const ctxA = await browser.newContext()
    await login(await ctxA.newPage(), A)
    await ctxA.close()
    const ctxB = await browser.newContext()
    await login(await ctxB.newPage(), B)
    await ctxB.close()
  })

  test('A 发消息，B 会话列表出现未读角标与消息预览', async ({ browser }) => {
    test.skip(!hasUsernames, '未配置 E2E_USER_A/B_USERNAME，跳过消息往返')
    const stamp = `e2e${Date.now()}`

    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    await login(pageA, A)
    await ensureFriend(pageA, B.username)
    await openChatByUsername(pageA, B.username)
    await sendMessage(pageA, `来自A ${stamp}`)
    await ctxA.close()

    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await login(pageB, B)
    await pageB.goto('/chats')
    await expect(pageB.getByTestId('unread-badge').first()).toBeVisible({ timeout: 30000 })
    await expect(pageB.getByText(`来自A ${stamp}`).first()).toBeVisible({ timeout: 30000 })
    await ctxB.close()
  })
})
