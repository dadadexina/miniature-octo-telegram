import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'
import useSwipeBack from '../hooks/useSwipeBack'
import {
  loadSettings,
  notifyIncoming,
  requestNotificationPermission,
  saveSettings,
  vibrateNow,
} from '../lib/appSettings'
import {
  buildMediaArchive,
  collectUserData,
  downloadBlob,
  downloadTextFile,
  exportFileName,
  serializeExport,
  summarizeExport,
} from '../lib/dataExport'
import { goBackOr } from '../lib/navigation'
import { isUuid } from '../lib/messages'
import { saveMomentCover } from '../lib/momentCover'
import { NOTIFICATION_SOUNDS, playNotificationSound } from '../lib/notificationSounds'
import { updateProfileSignature } from '../lib/profiles'
import {
  CUSTOM_RINGTONE_ID,
  DEFAULT_RINGTONE_ID,
  RINGTONES,
  playRingtone,
  stopRingtone,
} from '../lib/ringtones'
import {
  formatRingtoneSize,
  loadCustomRingtone,
  removeCustomRingtone,
  saveCustomRingtone,
} from '../lib/ringtoneStore'
import { supabase } from '../lib/supabase'
import {
  SIGNATURE_MAX,
  loadLocalSignature,
  normalizeSignature,
  saveLocalSignature,
} from '../lib/signature'
import { THEMES } from '../lib/themes'
import { useStore } from '../store'

const MAIN_ITEMS = [
  { key: 'notify', title: '通知', desc: '新消息提醒、声音与震动设置' },
  { key: 'display', title: '界面显示', desc: '主题、字体大小调整' },
  { key: 'security', title: '账号安全', desc: '修改密码、注销账号' },
  { key: 'other', title: '其他设置', desc: '个性签名等更多偏好' },
]

const VIEW_TITLES = {
  main: '设置',
  notify: '通知',
  display: '界面显示',
  security: '账号安全',
  other: '其他设置',
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

const PERMISSION_TEXT = {
  granted: '已开启，可在系统通知栏收到新消息',
  denied: '已被浏览器拒绝，请在站点设置中手动允许',
  default: '尚未授权，开启后才能收到系统通知',
  unsupported: '当前浏览器不支持系统通知',
}

function readNotificationPermission() {
  const NotificationApi = globalThis.Notification
  if (!NotificationApi) return 'unsupported'
  return NotificationApi.permission || 'default'
}

export default function Settings() {
  const navigate = useNavigate()
  const { currentUser, authUser, profile, setCloudProfile, purgeAccount, logout } = useStore()
  const [view, setView] = useState('main')
  const [settings, setSettings] = useState(() => loadSettings())
  const [notice, setNotice] = useState('')
  const [coverBusy, setCoverBusy] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [pwdBusy, setPwdBusy] = useState(false)
  const [customRingtone, setCustomRingtone] = useState(null)
  const [ringtoneBusy, setRingtoneBusy] = useState(false)
  const [signature, setSignature] = useState(() =>
    normalizeSignature(profile?.signature || loadLocalSignature(currentUser?.id) || '')
  )
  const [signatureBusy, setSignatureBusy] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(readNotificationPermission)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const fileRef = useRef(null)
  const ringtoneFileRef = useRef(null)
  const previewRef = useRef(null)
  const ringtonePreviewRef = useRef(null)
  const ringtoneTimerRef = useRef(null)

  const cloudAccount = isUuid(currentUser?.id)
  const email = authUser?.email || currentUser?.email || ''
  const phone = authUser?.phone || ''

  const update = (patch) => setSettings(saveSettings(patch))

  useEffect(() => {
    return () => {
      try {
        previewRef.current?.pause?.()
      } catch {
        // 页面卸载时停止试听
      }
      stopRingtone(ringtonePreviewRef.current)
      ringtonePreviewRef.current = null
      clearTimeout(ringtoneTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let alive = true
    loadCustomRingtone().then((record) => {
      if (!alive) return
      setCustomRingtone(record)
      if (!record && settings.callRingtoneId === CUSTOM_RINGTONE_ID) {
        setSettings(saveSettings({ callRingtoneId: DEFAULT_RINGTONE_ID, customRingtoneName: '' }))
      }
    })
    return () => {
      alive = false
    }
    // 仅在进入设置页时检查一次本地自定义铃声
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cooldown) return undefined
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const previewSound = (id) => {
    try {
      previewRef.current?.pause?.()
    } catch {
      // 忽略旧音频停止失败
    }
    previewRef.current = playNotificationSound(id)
  }

  const stopRingtonePreview = () => {
    clearTimeout(ringtoneTimerRef.current)
    ringtoneTimerRef.current = null
    stopRingtone(ringtonePreviewRef.current)
    ringtonePreviewRef.current = null
  }

  useEffect(() => {
    if (view !== 'notify') stopRingtonePreview()
    // 离开通知面板时停止循环试听
  }, [view])

  const previewCallRingtone = async (id) => {
    stopRingtonePreview()
    ringtonePreviewRef.current = await playRingtone(id)
    if (!ringtonePreviewRef.current) {
      setNotice(id === CUSTOM_RINGTONE_ID ? '自定义铃声不可用，请重新上传' : '当前环境无法播放铃声')
      return
    }
    ringtoneTimerRef.current = setTimeout(() => {
      stopRingtonePreview()
    }, 8000)
  }

  const onSelectRingtone = (id) => {
    update({ callRingtoneId: id })
    previewCallRingtone(id)
  }

  const onUploadRingtone = async (e) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setRingtoneBusy(true)
    try {
      const saved = await saveCustomRingtone(file)
      setCustomRingtone(saved)
      update({ callRingtoneId: CUSTOM_RINGTONE_ID, customRingtoneName: saved.name })
      setNotice('自定义来电铃声已保存')
      previewCallRingtone(CUSTOM_RINGTONE_ID)
    } catch (err) {
      setNotice(err?.message || '上传铃声失败')
    } finally {
      setRingtoneBusy(false)
    }
  }

  const onRemoveCustomRingtone = async () => {
    stopRingtonePreview()
    await removeCustomRingtone()
    setCustomRingtone(null)
    update({ callRingtoneId: DEFAULT_RINGTONE_ID, customRingtoneName: '' })
    setNotice('已移除自定义铃声')
  }

  const sendTestNotification = () => {
    if (!settings.notifyMessages) {
      setNotice('请先开启新消息提醒')
      return
    }
    notifyIncoming({ title: '新通知', body: '这是一条测试通知', force: true })
    setNotice('测试通知已发送')
  }

  const testVibration = () => {
    if (!vibrateNow()) {
      setNotice('当前设备不支持震动，请使用手机浏览器并保持页面前台')
      return
    }
    setNotice('已触发震动')
  }

  const enableNotifications = async () => {
    const result = await requestNotificationPermission()
    setNotificationPermission(result)
    if (result === 'granted') {
      setNotice('通知权限已开启')
      return
    }
    if (result === 'denied') {
      setNotice('通知权限被拒绝，请在浏览器站点设置中允许通知')
      return
    }
    setNotice('当前浏览器不支持通知权限')
  }

  const goBack = () => {
    if (confirmDelete) {
      setConfirmDelete(false)
      return
    }
    if (notice) {
      setNotice('')
      return
    }
    if (view !== 'main') {
      setView('main')
      return
    }
    goBackOr(navigate, '/me')
  }

  useSwipeBack(goBack)

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

  const onSaveSignature = async (e) => {
    e.preventDefault()
    const userId = currentUser?.id
    if (!userId) {
      setNotice('请先登录后再设置个性签名')
      return
    }
    const value = normalizeSignature(signature)
    setSignatureBusy(true)
    let remote = { ok: true }
    if (cloudAccount) {
      try {
        remote = await updateProfileSignature(userId, value)
      } catch (err) {
        remote = { ok: false, error: err?.message || '保存个性签名失败' }
      }
    }
    if (!remote.ok && !remote.localOnly) {
      setSignatureBusy(false)
      setNotice(remote.error || '保存个性签名失败')
      return
    }
    saveLocalSignature(userId, value)
    setSignature(value)
    setCloudProfile(
      remote.profile || { ...(profile || { id: userId }), signature: value },
      cloudAccount && Boolean(remote.ok)
    )
    setSignatureBusy(false)
    setNotice(remote.localOnly ? '云端资料表未升级，个性签名已保存到本机' : '个性签名已保存')
  }

  const validateNewPassword = () => {
    if (!cloudAccount) {
      setNotice('演示账号不支持修改密码，请登录云端账号后使用')
      return false
    }
    if (!oldPwd) {
      setNotice('请输入当前密码')
      return false
    }
    if (pwd.length < 6) {
      setNotice('新密码至少 6 位')
      return false
    }
    if (pwd !== pwd2) {
      setNotice('两次输入的密码不一致')
      return false
    }
    return true
  }

  const onRequestCode = async () => {
    if (!validateNewPassword()) return
    if (cooldown > 0) return
    if (!email && !phone) {
      setNotice('当前账号未绑定邮箱或手机号，无法发送验证码')
      return
    }
    setPwdBusy(true)
    const credentials = email ? { email, password: oldPwd } : { phone, password: oldPwd }
    const { error: verifyError } = await supabase.auth.signInWithPassword(credentials)
    if (verifyError) {
      setPwdBusy(false)
      setNotice('当前密码不正确')
      return
    }
    const { error: sendError } = await supabase.auth.reauthenticate()
    setPwdBusy(false)
    if (sendError) {
      setNotice(sendError.message || '验证码发送失败，请稍后重试')
      return
    }
    setCodeSent(true)
    setCooldown(60)
    setNotice(`验证码已发送至${email ? `邮箱 ${maskEmail(email)}` : `手机 ${maskPhone(phone)}`}`)
  }

  const onChangePassword = async (e) => {
    e.preventDefault()
    if (!validateNewPassword()) return
    if (!codeSent) {
      setNotice('请先验证当前密码并获取验证码')
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setNotice('请输入 6 位验证码')
      return
    }
    setPwdBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pwd, nonce: code.trim() })
    setPwdBusy(false)
    if (error) {
      setNotice(error.message || '修改密码失败')
      return
    }
    setOldPwd('')
    setPwd('')
    setPwd2('')
    setCode('')
    setCodeSent(false)
    setCooldown(0)
    setNotice('密码已更新')
  }

  const onExportData = async () => {
    if (!cloudAccount) {
      setNotice('演示账号没有云端数据可导出，请登录云端账号后使用')
      return
    }
    setExportBusy(true)
    try {
      const result = await collectUserData(supabase, currentUser.id, { email })
      if (!result.ok) {
        setNotice(result.error || '导出失败，请稍后重试')
        return
      }
      const fileName = exportFileName(currentUser.id)
      if (!downloadTextFile(fileName, serializeExport(result.payload))) {
        setNotice('当前环境不支持下载文件')
        return
      }
      const { total, mediaCount } = summarizeExport(result.payload)
      setNotice(`导出完成：${total} 条记录、${mediaCount} 个媒体文件清单，文件名 ${fileName}`)
    } catch {
      setNotice('导出失败，请稍后重试')
    } finally {
      setExportBusy(false)
    }
  }

  const onExportArchive = async () => {
    if (!cloudAccount) {
      setNotice('演示账号没有云端数据可导出，请登录云端账号后使用')
      return
    }
    setArchiveBusy(true)
    try {
      const result = await collectUserData(supabase, currentUser.id, { email })
      if (!result.ok) {
        setNotice(result.error || '导出失败，请稍后重试')
        return
      }
      const archive = await buildMediaArchive(supabase, result.payload)
      if (!archive.ok) {
        setNotice(archive.error || '打包媒体失败，请稍后重试')
        return
      }
      const blob = new Blob([archive.bytes], { type: 'application/zip' })
      if (!downloadBlob(archive.fileName, blob)) {
        setNotice('当前环境不支持下载文件')
        return
      }
      const { total } = summarizeExport(result.payload)
      const skipped = archive.skipped.length ? `，跳过 ${archive.skipped.length} 个` : ''
      setNotice(`导出完成：${total} 条记录、${archive.included} 个媒体文件${skipped}，文件名 ${archive.fileName}`)
    } catch {
      setNotice('打包媒体失败，请稍后重试')
    } finally {
      setArchiveBusy(false)
    }
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
                        if (item.key === 'notifyMessages' && value) {
                          requestNotificationPermission().then(setNotificationPermission)
                        }
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

            <div className="mt-6 px-4" data-testid="settings-dnd">
              <p className="text-[16px] text-eink-text">免打扰</p>
              <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                在设定时段内不逐条提醒，开启收件摘要后在免打扰结束后合并提示一次。
              </p>
              <div className="mt-3 border border-eink-divider bg-eink-bar">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[14px] text-eink-text">开启免打扰</span>
                  <Switch
                    checked={settings.dndEnabled}
                    onChange={(value) => update({ dndEnabled: value })}
                    label="开启免打扰"
                  />
                </div>
                {settings.dndEnabled ? (
                  <>
                    <div className="border-t border-eink-divider px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor="dnd-start" className="text-[14px] text-eink-text">
                          开始时间
                        </label>
                        <input
                          id="dnd-start"
                          data-testid="settings-dnd-start"
                          type="time"
                          value={settings.dndStart}
                          onChange={(e) => update({ dndStart: e.target.value })}
                          className="h-9 border border-eink-line/30 bg-eink-paper px-2 text-[14px] text-eink-text outline-none"
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <label htmlFor="dnd-end" className="text-[14px] text-eink-text">
                          结束时间
                        </label>
                        <input
                          id="dnd-end"
                          data-testid="settings-dnd-end"
                          type="time"
                          value={settings.dndEnd}
                          onChange={(e) => update({ dndEnd: e.target.value })}
                          className="h-9 border border-eink-line/30 bg-eink-paper px-2 text-[14px] text-eink-text outline-none"
                        />
                      </div>
                      <p className="mt-2 text-[12px] leading-5 text-eink-sub">
                        支持跨午夜，例如 22:00 至 08:00；开始与结束相同表示全天免打扰。
                      </p>
                    </div>
                    <div className="flex items-center justify-between border-t border-eink-divider px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-[14px] text-eink-text">收件摘要</span>
                        <span className="mt-0.5 block text-[12px] text-eink-sub">
                          免打扰结束后合并提示未读数量与来源
                        </span>
                      </span>
                      <Switch
                        checked={settings.digestEnabled}
                        onChange={(value) => update({ digestEnabled: value })}
                        label="收件摘要"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-6 px-4">
              <p className="text-[16px] text-eink-text">新通知</p>
              <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                发送一条测试通知，确认提示音、震动与通知权限是否正常。
              </p>
              <div
                data-testid="settings-notification-permission"
                className="mt-3 flex items-center justify-between border border-eink-divider bg-eink-bar px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] text-eink-text">通知权限</span>
                  <span className="mt-0.5 block text-[12px] text-eink-sub">
                    {PERMISSION_TEXT[notificationPermission] || PERMISSION_TEXT.default}
                  </span>
                </span>
                {notificationPermission === 'default' ? (
                  <button
                    type="button"
                    data-testid="settings-enable-notifications"
                    className="ml-3 h-8 shrink-0 border border-eink-ink px-3 text-[12px] text-eink-ink active:bg-[#E7E5DD]"
                    onClick={enableNotifications}
                  >
                    开启
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                data-testid="settings-test-notification"
                className="mt-3 h-10 w-full border border-eink-ink text-[14px] text-eink-ink active:bg-[#E7E5DD]"
                onClick={sendTestNotification}
              >
                发送测试通知
              </button>
              <button
                type="button"
                data-testid="settings-test-vibration"
                className="mt-2 h-10 w-full border border-eink-divider text-[14px] text-eink-sub active:bg-[#E7E5DD]"
                onClick={testVibration}
              >
                测试震动
              </button>
              <p className="mt-2 text-[12px] leading-5 text-eink-sub">
                震动需要手机浏览器支持，且页面保持在前台。
              </p>
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

            <div className="mt-6 px-4 pb-8" data-testid="settings-ringtone-list">
              <p className="text-[16px] text-eink-text">来电铃声</p>
              <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                默认提供 10 条来电铃声，点击即可试听；也可以上传自己的音频。
              </p>
              <ul className="mt-3 border border-eink-divider bg-eink-bar">
                {RINGTONES.map((ringtone, index) => {
                  const active = settings.callRingtoneId === ringtone.id
                  return (
                    <li key={ringtone.id} className={index ? 'border-t border-eink-divider' : ''}>
                      <button
                        type="button"
                        data-testid={`settings-ringtone-${ringtone.id}`}
                        aria-pressed={active}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left active:bg-[#E7E5DD]"
                        onClick={() => onSelectRingtone(ringtone.id)}
                      >
                        <span className="flex min-w-0 items-center gap-2 text-[15px] text-eink-text">
                          <span
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                              active ? 'bg-eink-ink' : 'bg-eink-disabled'
                            }`}
                          />
                          <span className="truncate">{ringtone.name}</span>
                        </span>
                        <span className="ml-3 shrink-0 text-[12px] text-eink-sub">
                          {active ? '使用中 · 试听' : '试听'}
                        </span>
                      </button>
                    </li>
                  )
                })}
                {customRingtone ? (
                  <li className="border-t border-eink-divider">
                    <button
                      type="button"
                      data-testid="settings-ringtone-custom"
                      aria-pressed={settings.callRingtoneId === CUSTOM_RINGTONE_ID}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left active:bg-[#E7E5DD]"
                      onClick={() => onSelectRingtone(CUSTOM_RINGTONE_ID)}
                    >
                      <span className="flex min-w-0 items-center gap-2 text-[15px] text-eink-text">
                        <span
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                            settings.callRingtoneId === CUSTOM_RINGTONE_ID ? 'bg-eink-ink' : 'bg-eink-disabled'
                          }`}
                        />
                        <span className="truncate">自定义：{customRingtone.name}</span>
                      </span>
                      <span className="ml-3 shrink-0 text-[12px] text-eink-sub">
                        {settings.callRingtoneId === CUSTOM_RINGTONE_ID ? '使用中 · 试听' : '试听'}
                      </span>
                    </button>
                  </li>
                ) : null}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  data-testid="settings-upload-ringtone"
                  className="h-10 flex-1 border border-eink-ink text-[14px] text-eink-ink active:bg-[#E7E5DD] disabled:opacity-60"
                  onClick={() => ringtoneFileRef.current?.click()}
                  disabled={ringtoneBusy}
                >
                  {ringtoneBusy ? '正在保存...' : customRingtone ? '更换自定义铃声' : '上传自定义铃声'}
                </button>
                {customRingtone ? (
                  <button
                    type="button"
                    data-testid="settings-remove-ringtone"
                    className="h-10 border border-eink-divider px-4 text-[14px] text-eink-sub active:bg-[#E7E5DD]"
                    onClick={onRemoveCustomRingtone}
                  >
                    移除
                  </button>
                ) : null}
              </div>
              {customRingtone ? (
                <p className="mt-2 text-[12px] text-eink-sub">
                  文件大小 {formatRingtoneSize(customRingtone.size)}，保存在本机。
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {view === 'display' ? (
          <div data-testid="settings-display">
            <div className="mt-6 px-4" data-testid="settings-theme-list">
              <p className="text-[16px] text-eink-text">主题</p>
              <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                从纸墨、羊皮纸、青苔、雾蓝、墨夜中选择，保存后立即应用。
              </p>
              <ul className="mt-3 border border-eink-divider bg-eink-bar">
                {THEMES.map((theme, index) => {
                  const active = settings.theme === theme.id
                  return (
                    <li key={theme.id} className={index ? 'border-t border-eink-divider' : ''}>
                      <button
                        type="button"
                        data-testid={`settings-theme-${theme.id}`}
                        aria-pressed={active}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left active:bg-[#E7E5DD]"
                        onClick={() => update({ theme: theme.id })}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex shrink-0 border border-eink-divider" aria-hidden="true">
                            {theme.swatches.map((color) => (
                              <span key={color} className="h-6 w-4" style={{ backgroundColor: color }} />
                            ))}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[15px] text-eink-text">{theme.name}</span>
                            <span className="mt-0.5 block text-[12px] text-eink-sub">{theme.desc}</span>
                          </span>
                        </span>
                        <span className="ml-3 shrink-0 text-[12px] text-eink-sub">
                          {active ? '使用中' : '选择'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

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
            <p data-testid="settings-phone" className="px-4 pt-1 text-[12px] text-eink-sub">
              绑定手机：{phone ? maskPhone(phone) : '未绑定'}
            </p>
            {!cloudAccount ? (
              <p data-testid="settings-demo-security" className="mx-4 mt-2 border border-eink-divider bg-eink-bar px-3 py-2 text-[12px] leading-5 text-eink-sub">
                演示账号不支持修改密码与注销，请登录云端账号后使用。
              </p>
            ) : null}

            <form className="mt-4 border-y border-eink-divider bg-eink-bar" onSubmit={onChangePassword}>
              <div className="px-4 py-3">
                <label className="block text-[16px] text-eink-text" htmlFor="old-password">
                  修改密码
                </label>
                <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                  需要先验证当前密码，再输入邮箱或手机验证码，无法直接修改。
                </p>
                <input
                  id="old-password"
                  data-testid="settings-old-password"
                  type="password"
                  autoComplete="current-password"
                  className="mt-3 h-10 w-full border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
                  placeholder="当前密码"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                />
                <input
                  id="new-password"
                  data-testid="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-2 h-10 w-full border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
                  placeholder="新密码，至少 6 位"
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

                <div className="mt-2 flex gap-2">
                  <input
                    data-testid="settings-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="h-10 min-w-0 flex-1 border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
                    placeholder="6 位邮箱/手机验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button
                    type="button"
                    data-testid="settings-send-code"
                    className="h-10 shrink-0 border border-eink-ink px-3 text-[13px] text-eink-ink active:bg-[#E7E5DD] disabled:opacity-60"
                    onClick={onRequestCode}
                    disabled={pwdBusy || cooldown > 0}
                  >
                    {cooldown > 0 ? `${cooldown}s 后重发` : codeSent ? '重新发送' : '获取验证码'}
                  </button>
                </div>
                {codeSent ? (
                  <p className="mt-2 text-[12px] leading-5 text-eink-sub">
                    验证码已发送，请查收绑定邮箱或手机短信。
                  </p>
                ) : null}

                <button
                  type="submit"
                  data-testid="settings-save-password"
                  className="mt-3 h-10 w-full bg-eink-ink text-[15px] text-eink-paper active:bg-eink-pressed disabled:opacity-60"
                  disabled={pwdBusy}
                >
                  {pwdBusy ? '正在保存...' : '确认修改密码'}
                </button>
              </div>
            </form>

            <div className="mt-8 border-y border-eink-divider bg-eink-bar">
              <div className="px-4 py-3.5">
                <p className="text-[16px] text-eink-text">导出我的数据</p>
                <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                  打包下载资料、消息、朋友圈、好友与偏好设置的 JSON 文件，包含媒体文件路径清单，不含图片文件本体。
                </p>
                <button
                  type="button"
                  data-testid="settings-export-data"
                  className="mt-3 h-10 w-full border border-eink-ink text-[15px] text-eink-ink active:bg-[#E7E5DD] disabled:opacity-60"
                  onClick={onExportData}
                  disabled={exportBusy}
                >
                  {exportBusy ? '正在打包...' : '下载数据文件'}
                </button>
                <button
                  type="button"
                  data-testid="settings-export-archive"
                  className="mt-2 h-10 w-full border border-eink-divider text-[15px] text-eink-sub active:bg-[#E7E5DD] disabled:opacity-60"
                  onClick={onExportArchive}
                  disabled={archiveBusy}
                >
                  {archiveBusy ? '正在打包媒体...' : '下载含媒体压缩包'}
                </button>
                <p className="mt-2 text-[12px] leading-5 text-eink-sub">
                  压缩包包含 data.json 与头像、朋友圈、消息图片，单文件上限 15MB，总量上限 80MB。
                </p>
              </div>
            </div>

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

        {view === 'other' ? (
          <div data-testid="settings-other">
            <form className="mt-3 border-y border-eink-divider bg-eink-bar" onSubmit={onSaveSignature}>
              <div className="px-4 py-3.5">
                <label className="block text-[16px] text-eink-text" htmlFor="profile-signature">
                  个性签名
                </label>
                <p className="mt-0.5 text-[12px] leading-5 text-eink-sub">
                  显示在发现页头像下方，最多 {SIGNATURE_MAX} 个字。
                </p>
                <textarea
                  id="profile-signature"
                  data-testid="settings-signature-input"
                  rows={3}
                  maxLength={SIGNATURE_MAX}
                  className="mt-3 w-full resize-none border border-eink-line/30 bg-eink-paper px-3 py-2 text-[15px] leading-6 outline-none"
                  placeholder="写一句签名，例如：见字如面。"
                  value={signature}
                  onChange={(e) => setSignature(normalizeSignature(e.target.value))}
                />
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[12px] text-eink-sub">
                    {signature.length}/{SIGNATURE_MAX}
                  </span>
                  <button
                    type="submit"
                    data-testid="settings-save-signature"
                    className="h-9 border border-eink-ink px-4 text-[14px] text-eink-ink active:bg-[#E7E5DD] disabled:opacity-60"
                    disabled={signatureBusy}
                  >
                    {signatureBusy ? '正在保存...' : '保存签名'}
                  </button>
                </div>
              </div>
            </form>
            <p className="mt-3 px-4 text-[12px] leading-5 text-eink-sub">
              签名会保存在云端并同步到其他设备；云端未升级时会先保存在本机。
            </p>
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

      <input
        ref={ringtoneFileRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac"
        className="hidden"
        onChange={onUploadRingtone}
        data-testid="settings-ringtone-input"
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

function maskEmail(value) {
  const [name, domain] = String(value || '').split('@')
  if (!name || !domain) return value || ''
  const head = name.slice(0, 2)
  return `${head}${name.length > 2 ? '***' : '*'}@${domain}`
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 7) return value || ''
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
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
