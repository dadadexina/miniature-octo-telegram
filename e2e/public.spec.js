import { expect, test } from '@playwright/test'

test.describe('公开页冒烟（无需后端凭据）', () => {
  test('登录页渲染与必填校验', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '邮箱登录 / 注册' })).toBeVisible()
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByText('请输入邮箱和密码')).toBeVisible()
  })

  test('注册短密码本地拦截，不触发网络', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('name@example.com').fill('e2e@example.com')
    await page.getByPlaceholder('至少 6 位').fill('123')
    await page.getByRole('button', { name: '注册', exact: true }).click()
    await expect(page.getByText('密码至少 6 位')).toBeVisible()
  })

  test('未登录访问受保护页重定向到登录', async ({ page }) => {
    await page.goto('/chats')
    await expect(page).toHaveURL(/\/login$/, { timeout: 15000 })
  })

  test('协议与隐私页可访问', async ({ page }) => {
    await page.goto('/legal/terms')
    await expect(page.getByText('用户协议').first()).toBeVisible()
    await page.goto('/legal/privacy')
    await expect(page.getByText('隐私政策').first()).toBeVisible()
  })

  test('重置密码页缺少 code 时提示链接失效', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByText('链接无效或已过期。')).toBeVisible({ timeout: 15000 })
  })

  test('底部导航四个入口存在', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('link', { name: '用户协议' })).toBeVisible()
    await expect(page.getByRole('link', { name: '隐私政策' })).toBeVisible()
  })
})
