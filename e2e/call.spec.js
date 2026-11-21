import { expect, test } from '@playwright/test'

test.describe.configure({ timeout: 180_000, mode: 'serial' })

// 用 Chromium 假麦克风跑完整通话链路,避免真实设备与系统弹窗
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
})

const A = {
  email: process.env.E2E_USER_A_EMAIL,
  password: process.env.E2E_USER_A_PASSWORD,
}
const B = {
  email: process.env.E2E_USER_B_EMAIL,
  password: process.env.E2E_USER_B_PASSWORD,
}
const hasLogin = Boolean(A.email && A.password && B.email && B.password)

async function login(page, user) {
  await page.goto('/login')
  await page.getByPlaceholder('name@example.com').fill(user.email)
  await page.getByPlaceholder('至少 6 位').fill(user.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/chats$/, { timeout: 30000 })
}

const userId = (page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /-auth-token$/.test(k))
    return key ? JSON.parse(localStorage.getItem(key))?.user?.id || '' : ''
  })

test.describe('语音通话', () => {
  test.skip(!hasLogin, '需要 E2E_USER_A/B 凭据')

  test('A 呼叫 B:B 弹出来电,接听后双向音频接通,支持静音/免提/挂断', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    // 等 B 的实时信令通道加入完成,避免首次邀请落在订阅之前
    await pageB.waitForTimeout(2000)
    const bId = await userId(pageB)
    expect(bId).toMatch(/-/)

    await pageA.goto(`/chat/${bId}`)
    await expect(pageA.getByTestId('call-audio-btn')).toBeVisible({ timeout: 20000 })
    await pageA.getByTestId('call-audio-btn').click()
    await expect(pageA.getByTestId('call-status')).toHaveText('正在呼叫对方...', { timeout: 15000 })

    // 来电必须自动弹出,不需要 B 刷新页面
    await expect(pageB.getByTestId('call-answer')).toBeVisible({ timeout: 30000 })
    await expect(pageB.getByTestId('call-status')).toHaveText('邀请你语音通话')
    await pageB.getByTestId('call-answer').click()

    // 两端都进入通话中并开始计时
    await expect(pageA.getByTestId('call-status')).toHaveText(/^\d+:\d\d$/, { timeout: 40000 })
    await expect(pageB.getByTestId('call-status')).toHaveText(/^\d+:\d\d$/, { timeout: 40000 })

    // 双端都拿到对方的音频轨道
    const tracks = async (page) =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="remote-audio"]')
        const stream = el?.srcObject
        if (!stream?.getAudioTracks) return 0
        return stream.getAudioTracks().filter((track) => track.readyState === 'live').length
      })
    await expect.poll(() => tracks(pageA), { timeout: 20000 }).toBeGreaterThan(0)
    await expect.poll(() => tracks(pageB), { timeout: 20000 }).toBeGreaterThan(0)

    // 静音
    await pageA.getByTestId('call-mute').click()
    await expect(pageA.getByTestId('call-muted-hint')).toBeVisible()
    await pageA.getByTestId('call-mute').click()
    await expect(pageA.getByTestId('call-muted-hint')).toHaveCount(0)

    // 免提开关(Chromium 支持 setSinkId)
    const speaker = pageA.getByTestId('call-speaker')
    if (await speaker.count()) {
      await expect(speaker).toHaveAttribute('aria-pressed', 'true')
      await speaker.click()
      await expect(speaker).toHaveAttribute('aria-pressed', 'false')
      await speaker.click()
      await expect(speaker).toHaveAttribute('aria-pressed', 'true')
    }

    // 挂断后两端浮层关闭
    await pageA.getByTestId('call-hangup').click()
    await expect(pageA.getByTestId('call-status')).toHaveCount(0, { timeout: 15000 })
    await expect(pageB.getByTestId('call-status')).toHaveCount(0, { timeout: 20000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('B 拒接时 A 显示对方已拒绝', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    await login(pageA, A)
    await login(pageB, B)
    await pageB.waitForTimeout(2000)
    const bId = await userId(pageB)

    await pageA.goto(`/chat/${bId}`)
    await pageA.getByTestId('call-audio-btn').click()
    await expect(pageB.getByTestId('call-decline')).toBeVisible({ timeout: 30000 })
    await pageB.getByTestId('call-decline').click()
    await expect(pageA.getByTestId('call-status')).toHaveText('对方已拒绝通话', { timeout: 20000 })

    await ctxA.close()
    await ctxB.close()
  })
})
