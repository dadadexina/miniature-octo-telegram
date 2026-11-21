import { expect, test } from '@playwright/test'

test.describe.configure({ timeout: 120_000, mode: 'serial' })

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

// v2 好友关系为「请求 → 验证」双向流程;幂等处理已是好友/请求已存在的情况
async function ensureFriendship(pageA, pageB) {
  await pageA.goto('/contacts')
  const search = pageA.getByPlaceholder('输入用户名 ID 搜索')
  await search.fill(B.username)
  await search.press('Enter')
  const results = pageA.getByTestId('search-results')
  await expect(results).toBeVisible({ timeout: 20000 })
  const addBtn = results.getByTestId('search-result-add').first()
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click()
    await expect(pageA.getByText(/好友请求已发送|已发送过好友请求/).first()).toBeVisible({ timeout: 15000 })
  }

  // B 端接受请求(若存在);realtime 可能尚未订阅,未出现时重新加载页面
  for (let i = 0; i < 3; i += 1) {
    await pageB.goto('/contacts')
    const acceptBtn = pageB.getByTestId('accept-request').first()
    const hasAccept = await acceptBtn
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (hasAccept) {
      await acceptBtn.click()
      await expect(pageB.getByText('已添加好友').first()).toBeVisible({ timeout: 15000 })
      break
    }
    const alreadyFriend = pageB
      .getByTestId('friend-entry')
      .filter({ hasText: `ID: ${A.username}` })
      .first()
    if ((await alreadyFriend.count()) > 0) break
  }

  // A 端确认好友入口出现(挂载刷新 + realtime)
  await pageA.goto('/contacts')
  await expect(
    pageA.getByTestId('friend-entry').filter({ hasText: `ID: ${B.username}` }).first()
  ).toBeVisible({ timeout: 30000 })
}

async function openChatByUsername(page, username) {
  await page.goto('/contacts')
  const link = page.getByTestId('friend-entry').filter({ hasText: `ID: ${username}` }).first()
  await expect(link).toBeVisible({ timeout: 20000 })
  await link.click()
  await expect(page.getByTestId('send-message-btn')).toBeVisible({ timeout: 20000 })
  await page.getByTestId('send-message-btn').click()
  await expect(page.getByPlaceholder('发送消息')).toBeVisible({ timeout: 20000 })
}

async function sendMessage(page, text) {
  await page.getByPlaceholder('发送消息').fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText(text).last()).toBeVisible({ timeout: 20000 })
}

// 等乐观队列落地云端后再点消息行(临时气泡没有操作面板,data-msg-id 仅存在于已合并消息)
async function clickCloudMessage(page, stamp) {
  await expect(page.getByTestId('pending-sending')).toHaveCount(0, { timeout: 20000 })
  const row = page.locator('[data-msg-id]').filter({ hasText: stamp }).last()
  await expect(row).toBeVisible({ timeout: 20000 })
  await row.click()
}

test.describe('云端双人聊天流（需 E2E_USER_A/B 凭据）', () => {
  test.skip(!hasLogin, '未配置 E2E_USER_A/B 邮箱密码，跳过云端 e2e')
  test.skip(!hasUsernames, '未配置 E2E_USER_A/B_USERNAME，跳过云端 e2e')

  test('A、B 均可登录并到达会话列表', async ({ browser }) => {
    const ctxA = await browser.newContext()
    await login(await ctxA.newPage(), A)
    await ctxA.close()
    const ctxB = await browser.newContext()
    await login(await ctxB.newPage(), B)
    await ctxB.close()
  })

  test('好友请求 → 接受 → A 发消息 → B 未读角标与预览', async ({ browser }) => {
    const stamp = `e2e${Date.now()}`
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)

    await ensureFriendship(pageA, pageB)
    await openChatByUsername(pageA, B.username)
    await sendMessage(pageA, `来自A ${stamp}`)

    // B 打开会话前应保持未读
    await pageB.goto('/chats')
    await expect(pageB.getByTestId('unread-badge').first()).toBeVisible({ timeout: 30000 })
    await expect(pageB.getByText(`来自A ${stamp}`).first()).toBeVisible({ timeout: 30000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('B 打开会话回写读水位 → A 端出现已读回执 → 2 分钟内撤回双端可见占位', async ({ browser }) => {
    const stamp = `回执${Date.now()}`
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    await ensureFriendship(pageA, pageB)

    await openChatByUsername(pageA, B.username)
    await sendMessage(pageA, stamp)

    // B 打开与 A 的会话,触发 read_cursors 回写
    await openChatByUsername(pageB, A.username)
    await expect(pageB.getByText(stamp).last()).toBeVisible({ timeout: 30000 })

    // A 端通过 realtime 收到对端读水位,显示已读
    await expect(pageA.getByTestId('read-receipt').first()).toHaveText('已读', { timeout: 30000 })

    // A 撤回:点击消息展开操作面板
    await clickCloudMessage(pageA, stamp)
    await expect(pageA.getByTestId('msg-actions')).toBeVisible({ timeout: 10000 })
    await pageA.getByTestId('recall-action').click()
    await expect(pageA.getByTestId('recalled-placeholder').first()).toHaveText('你撤回了一条消息', { timeout: 20000 })

    // B 端实时收到撤回更新
    await expect(pageB.getByTestId('recalled-placeholder').first()).toHaveText('对方撤回了一条消息', { timeout: 30000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('A 单方删除消息后自己不可见,B 端仍存在', async ({ browser }) => {
    const stamp = `删除${Date.now()}`
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    await ensureFriendship(pageA, pageB)

    await openChatByUsername(pageA, B.username)
    await sendMessage(pageA, stamp)

    await clickCloudMessage(pageA, stamp)
    await expect(pageA.getByTestId('msg-actions')).toBeVisible({ timeout: 10000 })
    await pageA.getByTestId('delete-action').click()
    await expect(pageA.getByText(stamp)).toHaveCount(0, { timeout: 15000 })

    // 重新进入会话,隐藏过滤仍生效
    await openChatByUsername(pageA, B.username)
    await expect(pageA.getByText(stamp)).toHaveCount(0, { timeout: 15000 })

    // B 端不受影响
    await openChatByUsername(pageB, A.username)
    await expect(pageB.getByText(stamp).last()).toBeVisible({ timeout: 30000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('A 拉黑 B 后再解除,状态可逆', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    await ensureFriendship(pageA, pageB)

    await openChatByUsername(pageA, B.username)
    await pageA.getByTestId('chat-menu').click()
    await pageA.getByTestId('block-toggle').click()
    await expect(pageA.getByText('已拉黑，对方无法再给你发消息').first()).toBeVisible({ timeout: 15000 })

    // 菜单文案切换为「取消拉黑」,点击恢复
    await pageA.getByTestId('chat-menu').click()
    await expect(pageA.getByTestId('block-toggle')).toHaveText('取消拉黑')
    await pageA.getByTestId('block-toggle').click()
    await expect(pageA.getByText('已取消拉黑').first()).toBeVisible({ timeout: 15000 })

    // B 端仍可正常发消息
    await openChatByUsername(pageB, A.username)
    const stamp = `解禁${Date.now()}`
    await sendMessage(pageB, stamp)
    await openChatByUsername(pageA, B.username)
    await expect(pageA.getByText(stamp).last()).toBeVisible({ timeout: 30000 })

    await ctxA.close()
    await ctxB.close()
  })
  test('A 删除好友 → 会话与历史清空 → B 发送失败 → 重新添加需对方同意', async ({ browser }) => {
    const stamp = `删除${Date.now()}`
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    await ensureFriendship(pageA, pageB)

    await openChatByUsername(pageA, B.username)
    await sendMessage(pageA, stamp)
    await openChatByUsername(pageB, A.username)
    await expect(pageB.getByText(stamp).last()).toBeVisible({ timeout: 20000 })

    // A 在通讯录删除 B,本地会话与历史应立即清空
    await pageA.goto('/contacts')
    await pageA.getByRole('button', { name: '编辑', exact: true }).click()
    const row = pageA.getByTestId('contact-edit-row').filter({ hasText: `ID: ${B.username}` }).first()
    await row.getByTestId('contact-delete').click()
    await pageA.getByTestId('contact-delete-confirm').click()
    await expect(pageA.getByText('已删除好友，聊天记录已清空')).toBeVisible({ timeout: 15000 })
    await pageA.goto('/chats')
    await expect(pageA.getByText(stamp)).toHaveCount(0, { timeout: 15000 })

    // B 仍停留在会话页,此时发送应失败并显示感叹号重试
    await pageB.getByPlaceholder('发送消息').fill(`被删${stamp}`)
    await pageB.getByRole('button', { name: '发送', exact: true }).click()
    await expect(pageB.getByTestId('pending-failed').first()).toBeVisible({ timeout: 20000 })

    // 重新添加必须走请求流程:A 端不立即出现好友,等 B 同意后才出现
    await pageA.goto('/contacts')
    // 清掉历史遗留的待处理请求,保证本次点击的是「添加」
    const staleCancel = pageA.getByTestId('cancel-request').first()
    if (await staleCancel.isVisible().catch(() => false)) {
      await staleCancel.click()
      await expect(pageA.getByText('已取消请求').first()).toBeVisible({ timeout: 15000 })
    }
    const search = pageA.getByPlaceholder('输入用户名 ID 搜索')
    await search.fill(B.username)
    await search.press('Enter')
    const results = pageA.getByTestId('search-results')
    await expect(results).toBeVisible({ timeout: 20000 })
    await results.getByTestId('search-result-add').first().click()
    await expect(pageA.getByText('好友请求已发送，等待对方同意')).toBeVisible({ timeout: 15000 })
    await expect(
      pageA.getByTestId('friend-entry').filter({ hasText: `ID: ${B.username}` })
    ).toHaveCount(0)

    await pageB.goto('/contacts')
    const acceptBtn = pageB.getByTestId('accept-request').first()
    await expect(acceptBtn).toBeVisible({ timeout: 20000 })
    await acceptBtn.click()
    await expect(pageB.getByText('已添加好友').first()).toBeVisible({ timeout: 15000 })

    await pageA.goto('/contacts')
    await expect(
      pageA.getByTestId('friend-entry').filter({ hasText: `ID: ${B.username}` }).first()
    ).toBeVisible({ timeout: 30000 })

    await ctxA.close()
    await ctxB.close()
  })
})
