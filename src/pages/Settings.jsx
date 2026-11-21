import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'
import {
  loadSettings,
  notifyIncoming,
  requestNotificationPermission,
  saveSettings,
} from '../lib/appSettings'
import { isUuid } from '../lib/messages'
import { saveMomentCover } from '../lib/momentCover'
import { NOTIFICATION_SOUNDS, playNotificationSound } from '../lib/notificationSounds'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

const MAIN_ITEMS = [
  { key: 'notify', title: '通知', desc: '新消息提醒、声音与震动设置' },
  { key: 'display', title: '界面显示', desc: '深色模式、字体大小调整' },
  { key: 'security', title: '账号安全', desc: '修改密码、注销账号' },
]

const VIEW_TITLES = {
  main: '设置',
  notify: '通知',
  display: '界面显示',
  security: '账号安全',
}

const NOTIFY_ITEMS = [
  { key: 'notifyMessages', title: '新消息提醒', desc: '收到新消息时在通知栏提醒' },
  { key: 'notifySound', title: '声音', desc: '新消息到达时播放提示音' },
  { key: 'notifyVibrate', title: '震动', desc: '新消息到达时震动提醒' },
]

const FONT_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'standard', label: '标准' },
  { value: 'large', label: '大' },
]

export default function Settings() {
  const navigate = useNavigate()
  const { currentUser, authUser, purgeAccount, logout } = useStore()
  const [view, setView] = useState('main')
  const [settings, setSettings] = useState(() => loadSettings())
  const [notice, setNotice] = useState('')
  const [coverBusy, setCoverBusy] = useState(false)
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef(null)
  const previewRef = useRef(null)

  const cloudAccount = isUuid(currentUser?.id)
  const email = authUser?.email || currentUser?.email || ''

  const update = (patch) => setSettings(saveSettings(patch))

  useEffect(() => {
    return () => {
      try {
        previewRef.current?.pause?.()
      } catch {
        // 页面卸载时停止试听
      }
    }
  }, [])

  const previewSound = (id) => {
    try {
      previewRef.current?.pause?.()
    } catch {
      // 忽略旧音频停止失败
    }
    previewRef.current = playNotificationSound(id)
  }

  const sendTestNotification = () => {
    if (!settings.notifyMessages) {
      setNotice('请先开启新消息提醒')
      return
    }
    notifyIncoming({ title: '新通知', body: '这是一条测试通知' })
    setNotice('测试通知已发送')
  }

  const goBack = () => {
    if (view !== 'main') {
      setView('main')
      return
    }
    navigate('/me')
  }

  const onChangeCover = async (e) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    const userId = currentUser?.id
    if (!userId) {
      setNotice('请先登录后再设置背景')
      return
    }
    setCoverBusy(true)
    const res = await saveMomentCover(userId, file)
    setCoverBusy(false)
    setNotice(res.ok ? '朋友圈背景已更新' : res.error || '更换背景失败')
  }

  const onChangePassword = async (e) => {
    e.preventDefault()
    if (!cloudAccount) {
      setNotice('演示账号不支持修改密码，请登录云端账号后使用')
      return
    }
    if (pwd.length < 6) {
      setNotice('新密码至少 6 位')
      return
    }
    if (pwd !== pwd2) {
      setNotice('两次输入的密码不一致')
      return
    }
    setPwdBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setPwdBusy(false)
    if (error) {
      setNotice(error.message || '修改密码失败')
      return
    }
    setPwd('')
    setPwd2('')
    setNotice('密码已更新')
  }

  const onDeleteAccount = async () => {
    setDeleting(true)
    const { data, error } = await supabase.functions.invoke('delete-account')
    if (error || data?.error) {
      setDeleting(false)
      setConfirmDelete(false)
      setNotice(error?.message || data?.error || '注销失败，请稍后重试')
      return
    }
    try {
      await supabase.auth.signOut()
    } catch {
      // 账号已在服务端删除，本地会话失效属预期
    }
    setDeleting(false)
    setConfirmDelete(false)
    purgeAccount()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-eink-paper">
      <NavBar title={VIEW_TITLES[view]} left={<BackButton onClick={goBack} />} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'main' ? (
          <MainList onOpen={setView} />
        ) : null}

        {view === 'notify' ? (
          <div data-testid="settings-notify">
            <ul className="mt-3 border-y border-eink-divider bg-eink-bar">
              {NOTIFY_ITEMS.map((item) => (
                <li key={item.key} className="border-t border-eink-divider first:border-t-0">
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="min-w-0">
                      <span className="block text-[16px] text-eink-text">{item.title}</span>
                      <span className="mt-0.5 block text-[12px] text-eink-sub">{item.desc}</span>
                    </span>
                    <Switch
                      checked={settings[item.key]}
                      onChange={(value) => {
                        update({ [item.key]: value })
                        if (item.key === 'notifyMessages' && value) requestNotificationPermission()
                      }}
                      label={item.title}
                    />
                  </div>
                </li>
              ))}
              <li className="border-t border-eink-divider px-4 py-3 text-[12px] leading-5 text-eink-sub">
                提醒偏好保存在本机，重新登录后仍会保留。
              </li>
            </ul>

            <div className="mt-6 px-4">
              <p className="text-[16px] text-eink-text">新通知</p>
              <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                发送一条测试通知，确认提示音、震动与通知权限是否正常。
              </p>
              <button
                type="button"
                data-testid="settings-test-notification"
                className="mt-3 h-10 w-full border border-eink-ink text-[14px] text-eink-ink active:bg-[#E7E5DD]"
                onClick={sendTestNotification}
              >
                发送测试通知
              </button>
            </div>

            <div className="mt-6 px-4 pb-8" data-testid="settings-sound-list">
              <p className="text-[16px] text-eink-text">提示音</p>
              <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                默认提供 10 个提示音，点击即可试听并设为新消息提示音。
              </p>
              <ul className="mt-3 border border-eink-divider bg-eink-bar">
                {NOTIFICATION_SOUNDS.map((sound, index) => {
                  const active = settings.notifySoundId === sound.id
                  return (
                    <li key={sound.id} className={index ? 'border-t border-eink-divider' : ''}>
                      <button
                        type="button"
                        data-testid={`settings-sound-${sound.id}`}
                        aria-pressed={active}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left active:bg-[#E7E5DD]"
                        onClick={() => {
                          update({ notifySoundId: sound.id })
                          previewSound(sound.id)
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2 text-[15px] text-eink-text">
                          <span
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                              active ? 'bg-eink-ink' : 'bg-eink-disabled'
                            }`}
                          />
                          <span className="truncate">{sound.name}</span>
                        </span>
                        <span className="ml-3 shrink-0 text-[12px] text-eink-sub">
                          {active ? '使用中 · 试听' : '试听'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        ) : null}

        {view === 'display' ? (
          <div data-testid="settings-display">
            <ul className="mt-3 border-y border-eink-divider bg-eink-bar">
              <li className="flex items-center justify-between px-4 py-3.5">
                <span className="min-w-0">
                  <span className="block text-[16px] text-eink-text">深色模式</span>
                  <span className="mt-0.5 block text-[12px] text-eink-sub">夜间使用更护眼</span>
                </span>
                <Switch
                  checked={settings.theme === 'dark'}
                  onChange={(value) => update({ theme: value ? 'dark' : 'light' })}
                  label="深色模式"
                />
              </li>
            </ul>

            <div className="mt-6 px-4">
              <p className="text-[16px] text-eink-text">字体大小</p>
              <div
                className="mt-2 grid grid-cols-3 border border-eink-divider"
                role="group"
                aria-label="字体大小"
              >
                {FONT_OPTIONS.map((option, index) => {
                  const active = settings.fontScale === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-testid={`settings-font-${option.value}`}
                      aria-pressed={active}
                      className={`h-10 text-[15px] ${index ? 'border-l border-eink-divider' : ''} ${
                        active ? 'bg-eink-ink text-eink-paper' : 'bg-eink-bar text-eink-text'
                      }`}
                      onClick={() => update({ fontScale: option.value })}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-eink-sub">调整聊天与朋友圈正文的大小。</p>
              <p className="moment-text mt-3 border border-eink-divider bg-eink-bar px-3 py-3 text-[15px] leading-[1.55] text-eink-ink">
                纸墨信笺，见字如面。
              </p>
            </div>

            <ul className="mt-6 border-y border-eink-divider bg-eink-bar">
              <li>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-[#E7E5DD]"
                  onClick={() => fileRef.current?.click()}
                  disabled={coverBusy}
                  data-testid="settings-change-cover"
                >
                  <span className="min-w-0">
                    <span className="block text-[16px] text-eink-text">更换朋友圈背景</span>
                    <span className="mt-0.5 block text-[12px] text-eink-sub">
                      {coverBusy ? '正在保存...' : '自定义发现页顶部背景图'}
                    </span>
                  </span>
                  <span className="ml-3 shrink-0 text-[18px] text-eink-faint">›</span>
                </button>
              </li>
            </ul>
          </div>
        ) : null}

        {view === 'security' ? (
          <div data-testid="settings-security">
            <p className="px-4 pt-4 text-[12px] text-eink-sub">当前账号：{email || '未绑定邮箱'}</p>
            {!cloudAccount ? (
              <p data-testid="settings-demo-security" className="mx-4 mt-2 border border-eink-divider bg-eink-bar px-3 py-2 text-[12px] leading-5 text-eink-sub">
                演示账号不支持修改密码与注销，请登录云端账号后使用。
              </p>
            ) : null}

            <form className="mt-4 border-y border-eink-divider bg-eink-bar" onSubmit={onChangePassword}>
              <div className="px-4 py-3">
                <label className="block text-[16px] text-eink-text" htmlFor="new-password">
                  修改密码
                </label>
                <p className="mt-0.5 text-[12px] text-eink-sub">输入新密码，至少 6 位。</p>
                <input
                  id="new-password"
                  data-testid="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-3 h-10 w-full border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
                  placeholder="新密码"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
                <input
                  data-testid="settings-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-2 h-10 w-full border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
                  placeholder="再次输入新密码"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                />
                <button
                  type="submit"
                  data-testid="settings-save-password"
                  className="mt-3 h-10 w-full bg-eink-ink text-[15px] text-eink-paper active:bg-eink-pressed disabled:opacity-60"
                  disabled={pwdBusy}
                >
                  {pwdBusy ? '正在保存...' : '保存新密码'}
                </button>
              </div>
            </form>

            <div className="mt-8 px-4 pb-8">
              <button
                type="button"
                data-testid="settings-delete-account"
                className="h-11 w-full border border-eink-ink text-[15px] text-eink-ink active:bg-[#E7E5DD]"
                onClick={() => (cloudAccount ? setConfirmDelete(true) : setNotice('演示账号无需注销'))}
              >
                注销账号
              </button>
              <p className="mt-2 text-center text-[12px] text-eink-sub">注销后云端数据不可恢复。</p>
            </div>
          </div>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChangeCover}
        data-testid="settings-cover-input"
      />

      {notice ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8"
          role="dialog"
          aria-modal="true"
          onClick={() => setNotice('')}
        >
          <div
            className="w-full max-w-[280px] border border-eink-divider bg-eink-paper px-5 pb-4 pt-5 text-center"
            data-testid="settings-notice"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[14px] leading-6 text-eink-text">{notice}</p>
            <button
              type="button"
              className="mt-4 h-10 w-full bg-eink-ink text-[14px] text-eink-paper active:bg-eink-pressed"
              onClick={() => setNotice('')}
            >
              确认
            </button>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div
            className="w-full max-w-[300px] border border-eink-divider bg-eink-paper px-5 pb-4 pt-5 text-center"
            role="dialog"
            aria-modal="true"
            data-testid="settings-confirm-delete"
          >
            <p className="text-[14px] leading-6 text-eink-text">
              注销账号会删除云端数据且不可恢复，确定继续？
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="h-10 flex-1 border border-eink-divider text-[14px] text-eink-sub"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className="h-10 flex-1 bg-eink-ink text-[14px] text-eink-paper disabled:opacity-60"
                onClick={onDeleteAccount}
                disabled={deleting}
              >
                {deleting ? '注销中...' : '确认注销'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MainList({ onOpen }) {
  return (
    <ul className="mt-3 border-y border-eink-divider bg-eink-bar" data-testid="settings-list">
      {MAIN_ITEMS.map((item, index) => (
        <li key={item.key} className={index ? 'border-t border-eink-divider' : ''}>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-[#E7E5DD]"
            onClick={() => onOpen(item.key)}
            data-testid={`settings-item-${index}`}
          >
            <span className="min-w-0">
              <span className="block text-[16px] text-eink-text">{item.title}</span>
              <span className="mt-0.5 block text-[12px] text-eink-sub">{item.desc}</span>
            </span>
            <span className="ml-3 shrink-0 text-[18px] text-eink-faint">›</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative ml-3 h-7 w-12 shrink-0 border ${
        checked ? 'border-eink-ink bg-eink-ink' : 'border-eink-divider bg-eink-disabled'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 bg-[#FBFAF7] transition-all ${
          checked ? 'left-[26px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      className="-ml-1 flex h-9 w-9 items-center justify-start"
      onClick={onClick}
      aria-label="返回"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14.5 6 9 12l5.5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
