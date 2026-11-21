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

async function login(page, user) {
  await page.goto('/login')
  await page.getByPlaceholder('name@example.com').fill(user.email)
  await page.getByPlaceholder('至少 6 位').fill(user.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/chats$/, { timeout: 30000 })
}

// 服务端好友态可能被历史用例清空,而本地缓存仍显示好友;这里统一走 UI 删除后重建
async function deleteFriendIfPresent(pageA) {
  await pageA.goto('/contacts')
  await pageA
    .getByTestId('friend-entry')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .catch(() => {})
  const entry = pageA.getByTestId('friend-entry').filter({ hasText: `ID: ${B.username}` }).first()
  if (!(await entry.count())) return false
  await pageA.getByRole('button', { name: '编辑', exact: true }).click()
  const row = pageA.getByTestId('contact-edit-row').filter({ hasText: `ID: ${B.username}` }).first()
  await row.getByTestId('contact-delete').click()
  await pageA.getByTestId('contact-delete-confirm').click()
  await expect(pageA.getByText('已删除好友，聊天记录已清空')).toBeVisible({ timeout: 15000 })
  return true
}

async function sendFriendRequest(pageA) {
  await pageA.goto('/contacts')
  const staleCancel = pageA.getByTestId('cancel-request').first()
  if (await staleCancel.isVisible().catch(() => false)) {
    await staleCancel.click()
    await expect(pageA.getByText('已取消请求').first()).toBeVisible({ timeout: 15000 })
  }
  const search = pageA.getByPlaceholder('搜索 ID / 邮箱 / 手机号')
  await search.fill(B.username)
  await search.press('Enter')
  const results = pageA.getByTestId('search-results')
  await expect(results).toBeVisible({ timeout: 20000 })
  await results.getByTestId('search-result-add').first().click()
  await expect(pageA.getByText(/好友请求已发送|已发送过好友请求/).first()).toBeVisible({ timeout: 15000 })
}

async function acceptRequest(pageB) {
  for (let i = 0; i < 3; i += 1) {
    await pageB.goto('/contacts')
    const acceptBtn = pageB.getByTestId('accept-request').first()
    const ok = await acceptBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
    if (ok) {
      await acceptBtn.click()
      await expect(pageB.getByText('已添加好友').first()).toBeVisible({ timeout: 15000 })
      return
    }
    const already = pageB.getByTestId('friend-entry').filter({ hasText: `ID: ${A.username}` }).first()
    if ((await already.count()) > 0) return
  }
  throw new Error('未找到好友申请')
}

async function rebuildFriendship(pageA, pageB) {
  await deleteFriendIfPresent(pageA)
  await sendFriendRequest(pageA)
  await acceptRequest(pageB)
  await pageA.goto('/contacts')
  await expect(
    pageA.getByTestId('friend-entry').filter({ hasText: `ID: ${B.username}` }).first()
  ).toBeVisible({ timeout: 30000 })
}

test.describe('未读与好友申请角标', () => {
  test.skip(!hasLogin, '需要 E2E_USER_A/B 凭据')

  test('B 停留在发现页也能第一时间看到消息未读角标', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    await rebuildFriendship(pageA, pageB)

    await pageB.goto('/discover')
    await pageA.goto('/contacts')
    await pageA
      .getByTestId('friend-entry')
      .filter({ hasText: `ID: ${B.username}` })
      .first()
      .click()
    await expect(pageA.getByTestId('send-message-btn')).toBeVisible({ timeout: 20000 })
    await pageA.getByTestId('send-message-btn').click()
    const stamp = `角标${Date.now()}`
    await pageA.getByPlaceholder('发送消息').fill(stamp)
    await pageA.getByRole('button', { name: '发送', exact: true }).click()

    // 不切页、不刷新,B 的底部消息角标应立即出现
    await expect(pageB.getByTestId('nav-badge-chats')).toBeVisible({ timeout: 20000 })
    await expect(pageB.getByTestId('nav-badge-chats')).toHaveText(/^\d+\+?$/)

    await ctxA.close()
    await ctxB.close()
  })

  test('收到好友申请时通讯录角标立即出现,同意后消失', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    await rebuildFriendship(pageA, pageB)

    // 先把已有好友关系移除,才能重新走一遍申请流程
    await pageA.goto('/contacts')
    await pageA
      .getByTestId('friend-entry')
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => {})
    const friendRow = pageA.getByTestId('friend-entry').filter({ hasText: `ID: ${B.username}` }).first()
    if ((await friendRow.count()) > 0) {
      await pageA.getByRole('button', { name: '编辑', exact: true }).click()
      const row = pageA.getByTestId('contact-edit-row').filter({ hasText: `ID: ${B.username}` }).first()
      await row.getByTestId('contact-delete').click()
      await pageA.getByTestId('contact-delete-confirm').click()
      await expect(pageA.getByText('已删除好友，聊天记录已清空')).toBeVisible({ timeout: 15000 })
      await pageA.goto('/contacts')
    }

    // B 停留在发现页,申请到达时不应依赖页面切换
    await pageB.goto('/discover')

    // 清理上次遗留的待处理申请后重新发送
    const staleCancel = pageA.getByTestId('cancel-request').first()
    if (await staleCancel.isVisible().catch(() => false)) {
      await staleCancel.click()
      await expect(pageA.getByText('已取消请求').first()).toBeVisible({ timeout: 15000 })
    }
    const search = pageA.getByPlaceholder('搜索 ID / 邮箱 / 手机号')
    await search.fill(B.username)
    await search.press('Enter')
    const results = pageA.getByTestId('search-results')
    await expect(results).toBeVisible({ timeout: 20000 })
    await results.getByTestId('search-result-add').first().click()
    await expect(pageA.getByText('好友请求已发送，等待对方同意')).toBeVisible({ timeout: 15000 })

    await expect(pageB.getByTestId('nav-badge-contacts')).toBeVisible({ timeout: 20000 })

    // 进入通讯录处理申请,角标消失且好友关系恢复
    await pageB.getByRole('link', { name: /通讯录/ }).click()
    await pageB.getByTestId('accept-request').first().click()
    await expect(pageB.getByText('已添加好友').first()).toBeVisible({ timeout: 15000 })
    await expect(pageB.getByTestId('nav-badge-contacts')).toHaveCount(0, { timeout: 15000 })

    await ctxA.close()
    await ctxB.close()
  })
})
