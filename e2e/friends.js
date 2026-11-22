import { expect } from '@playwright/test'

export async function ensureFriendship(pageA, pageB, A, B) {
  await pageA.goto('/contacts')
  const search = pageA.getByPlaceholder('搜索 ID / 邮箱 / 手机号')
  await search.fill(B.username)
  await search.press('Enter')
  const results = pageA.getByTestId('search-results')
  await expect(results).toBeVisible({ timeout: 20000 })
  const addBtn = results.getByTestId('search-result-add').first()
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click()
    await expect(
      pageA.getByText(/好友请求已发送|已发送过好友请求/).first()
    ).toBeVisible({ timeout: 15000 })
  }

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

  await pageA.goto('/contacts')
  await expect(
    pageA.getByTestId('friend-entry').filter({ hasText: `ID: ${B.username}` }).first()
  ).toBeVisible({ timeout: 30000 })
}
