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

async function search(page, keyword) {
  await page.goto('/contacts')
  const input = page.getByPlaceholder('搜索 ID / 邮箱 / 手机号')
  await input.fill(keyword)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.getByTestId('search-results')).toBeVisible({ timeout: 20000 })
}

test.describe('通讯录搜索与隐私', () => {
  test.skip(!hasLogin, '需要 E2E_USER_A/B 凭据')

  test('支持 ID/邮箱/手机号搜索,关闭后显示未找到', async ({ browser }) => {
    const phone = '13900001234'
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)

    // B 绑定手机号并保持默认允许搜索
    await pageB.goto('/profile/edit')
    await pageB.getByTestId('profile-phone-input').fill(phone)
    const emailToggle = pageB.getByTestId('allow-email-search')
    const phoneToggle = pageB.getByTestId('allow-phone-search')
    if (!(await emailToggle.isChecked())) await emailToggle.check()
    if (!(await phoneToggle.isChecked())) await phoneToggle.check()
    await pageB.getByRole('button', { name: '保存', exact: true }).click()
    await expect(pageB).toHaveURL(/\/me$/, { timeout: 20000 })

    // 三种方式都能搜到 B
    await search(pageA, B.username)
    await expect(pageA.getByTestId('search-results')).toContainText(B.username)
    await search(pageA, B.email)
    await expect(pageA.getByTestId('search-results')).toContainText('邮箱匹配')
    await search(pageA, phone)
    await expect(pageA.getByTestId('search-results')).toContainText('手机号匹配')

    // B 关闭邮箱与手机号搜索
    await pageB.goto('/profile/edit')
    await pageB.getByTestId('allow-email-search').uncheck()
    await pageB.getByTestId('allow-phone-search').uncheck()
    await pageB.getByRole('button', { name: '保存', exact: true }).click()
    await expect(pageB).toHaveURL(/\/me$/, { timeout: 20000 })

    await search(pageA, B.email)
    await expect(pageA.getByTestId('search-results')).toContainText('未找到该用户')
    await search(pageA, phone)
    await expect(pageA.getByTestId('search-results')).toContainText('未找到该用户')

    // 未注册的邮箱与手机号也显示未找到
    await search(pageA, 'nobody-e2e-0000@example.com')
    await expect(pageA.getByTestId('search-results')).toContainText('未找到该用户')
    await search(pageA, '19999999999')
    await expect(pageA.getByTestId('search-results')).toContainText('未找到该用户')

    // 还原 B 的设置,避免影响其他用例
    await pageB.goto('/profile/edit')
    await pageB.getByTestId('profile-phone-input').fill('')
    const emailAgain = pageB.getByTestId('allow-email-search')
    const phoneAgain = pageB.getByTestId('allow-phone-search')
    if (!(await emailAgain.isChecked())) await emailAgain.check()
    if (!(await phoneAgain.isChecked())) await phoneAgain.check()
    await pageB.getByRole('button', { name: '保存', exact: true }).click()
    await expect(pageB).toHaveURL(/\/me$/, { timeout: 20000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('ID 需为 8-15 位字母与数字组合', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await login(page, B)
    await page.goto('/profile/edit')
    const input = page.getByTestId('profile-id-input')
    test.skip(await input.isDisabled(), '该账号当前不在可修改 ID 的时间窗口')
    const original = await input.inputValue()
    await input.fill('abc123')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('ID 需为 8-15 位', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/profile\/edit$/)
    await input.fill(original)
    await ctx.close()
  })
})
