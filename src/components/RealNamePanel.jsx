import { useCallback, useEffect, useRef, useState } from 'react'
import {
  canSubmitRealName,
  fetchAdminRealNames,
  fetchMyRealName,
  isRealNameAdmin,
  realNameStatusText,
  removeRealNamePhoto,
  reviewRealName,
  signedRealNameUrl,
  submitRealName,
  uploadRealNamePhoto,
  validateChineseId,
  validateRealName,
} from '../lib/realName'
import { useStore } from '../store'

export default function RealNamePanel() {
  const { currentUser } = useStore()
  const userId = currentUser?.id || ''
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(Boolean(userId))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [frontFile, setFrontFile] = useState(null)
  const [backFile, setBackFile] = useState(null)
  const [admin, setAdmin] = useState(false)
  const [adminRows, setAdminRows] = useState([])
  const [adminBusy, setAdminBusy] = useState(false)
  const [notes, setNotes] = useState({})
  const [urls, setUrls] = useState({})
  const frontRef = useRef(null)
  const backRef = useRef(null)

  const loadMine = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const result = await fetchMyRealName()
    setLoading(false)
    if (result.ok) {
      setStatus(result.status)
      setNotice('')
      return
    }
    setNotice(result.error)
  }, [userId])

  const loadUrls = useCallback(async (rows) => {
    const entries = await Promise.all(
      rows.flatMap((row) => [
        signedRealNameUrl(row.frontPath).then((url) => [`${row.userId}:front`, url]),
        signedRealNameUrl(row.backPath).then((url) => [`${row.userId}:back`, url]),
      ])
    )
    setUrls(Object.fromEntries(entries.filter(([, url]) => url)))
  }, [])

  const loadAdmin = useCallback(async () => {
    const allowed = await isRealNameAdmin()
    setAdmin(allowed)
    if (!allowed) return
    setAdminBusy(true)
    const result = await fetchAdminRealNames()
    setAdminBusy(false)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setAdminRows(result.rows)
    await loadUrls(result.rows)
  }, [loadUrls])

  useEffect(() => {
    loadMine()
    loadAdmin()
  }, [loadMine, loadAdmin])

  const clearForm = () => {
    setName('')
    setIdNumber('')
    setFrontFile(null)
    setBackFile(null)
    if (frontRef.current) frontRef.current.value = ''
    if (backRef.current) backRef.current.value = ''
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!userId || busy) return
    const nameCheck = validateRealName(name)
    if (!nameCheck.ok) {
      setNotice(nameCheck.error)
      return
    }
    const idCheck = validateChineseId(idNumber)
    if (!idCheck.ok) {
      setNotice(idCheck.error)
      return
    }
    if (!frontFile || !backFile) {
      setNotice('请上传身份证人像面和国徽面')
      return
    }
    setBusy(true)
    setNotice('')
    const front = await uploadRealNamePhoto(userId, 'front', frontFile)
    if (!front.ok) {
      setBusy(false)
      setNotice(front.error)
      return
    }
    const back = await uploadRealNamePhoto(userId, 'back', backFile)
    if (!back.ok) {
      await removeRealNamePhoto(front.path)
      setBusy(false)
      setNotice(back.error)
      return
    }
    const result = await submitRealName({
      realName: nameCheck.name,
      idNumber: idCheck.id,
      frontPath: front.path,
      backPath: back.path,
    })
    setBusy(false)
    if (!result.ok) {
      await removeRealNamePhoto(front.path)
      await removeRealNamePhoto(back.path)
      setNotice(result.error)
      return
    }
    setStatus(result.status)
    clearForm()
    loadAdmin()
  }

  const approve = async (row) => {
    setAdminBusy(true)
    const result = await reviewRealName(row.userId, true, notes[row.userId] || '')
    setAdminBusy(false)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setNotice('已通过实名申请')
    loadAdmin()
  }

  const reject = async (row) => {
    const note = String(notes[row.userId] || '').trim()
    if (!note) {
      setNotice('请填写驳回原因')
      return
    }
    setAdminBusy(true)
    const result = await reviewRealName(row.userId, false, note)
    setAdminBusy(false)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setNotice('已驳回实名申请')
    loadAdmin()
  }

  const currentStatus = status?.status || 'unverified'
  const showForm = canSubmitRealName(currentStatus)

  return (
    <div data-testid="real-name-panel">
      <div className="border-y border-eink-divider bg-eink-bar px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[16px] text-eink-text">实名认证</p>
            <p data-testid="real-name-status" className="mt-0.5 text-[12px] text-eink-sub">
              {loading ? '正在读取状态...' : realNameStatusText(currentStatus)}
            </p>
          </div>
          <button
            type="button"
            data-testid="real-name-refresh"
            className="h-8 shrink-0 border border-eink-line/40 px-3 text-[12px] text-eink-ink active:bg-eink-surface"
            onClick={() => {
              loadMine()
              loadAdmin()
            }}
          >
            刷新
          </button>
        </div>
        {status?.idNumberMasked ? (
          <p className="mt-2 text-[12px] text-eink-sub">证件号：{status.idNumberMasked}</p>
        ) : null}
        {status?.reviewNote ? (
          <p className="mt-2 border border-eink-divider bg-eink-paper px-3 py-2 text-[12px] leading-5 text-eink-sub">
            审核说明：{status.reviewNote}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-5 text-eink-faint">
          实名信息仅用于身份审核，证件照存放在私有空间，不会在公开页面展示。审核通过后仅记录“已实名”状态。
        </p>
      </div>

      {showForm ? (
        <form className="mt-4 border-y border-eink-divider bg-eink-bar" data-testid="real-name-form" onSubmit={submit}>
          <div className="px-4 py-3">
            {currentStatus === 'rejected' ? (
              <p className="mb-2 text-[12px] leading-5 text-eink-sub">上次申请未通过，请核对信息后重新提交。</p>
            ) : null}
            <label className="block text-[13px] text-eink-sub" htmlFor="real-name-input">
              真实姓名
            </label>
            <input
              id="real-name-input"
              data-testid="real-name-input"
              className="mt-2 h-10 w-full border border-eink-line/30 bg-eink-paper px-3 text-[15px] outline-none"
              maxLength={40}
              placeholder="与身份证一致"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setNotice('')
              }}
            />
            <label className="mt-3 block text-[13px] text-eink-sub" htmlFor="real-name-id">
              身份证号
            </label>
            <input
              id="real-name-id"
              data-testid="real-name-id"
              className="mt-2 h-10 w-full border border-eink-line/30 bg-eink-paper px-3 text-[15px] uppercase outline-none"
              maxLength={18}
              inputMode="text"
              autoComplete="off"
              placeholder="18 位身份证号"
              value={idNumber}
              onChange={(event) => {
                setIdNumber(event.target.value.replace(/[^0-9Xx]/g, '').toUpperCase())
                setNotice('')
              }}
            />
            <label className="mt-3 block text-[13px] text-eink-sub" htmlFor="real-name-front">
              身份证人像面
            </label>
            <input
              id="real-name-front"
              ref={frontRef}
              data-testid="real-name-front"
              type="file"
              accept="image/*"
              className="mt-2 block w-full text-[12px] text-eink-sub"
              onChange={(event) => {
                setFrontFile(event.target.files?.[0] || null)
                setNotice('')
              }}
            />
            <label className="mt-3 block text-[13px] text-eink-sub" htmlFor="real-name-back">
              身份证国徽面
            </label>
            <input
              id="real-name-back"
              ref={backRef}
              data-testid="real-name-back"
              type="file"
              accept="image/*"
              className="mt-2 block w-full text-[12px] text-eink-sub"
              onChange={(event) => {
                setBackFile(event.target.files?.[0] || null)
                setNotice('')
              }}
            />
            <p className="mt-2 text-[11px] leading-5 text-eink-faint">
              支持 JPG/PNG/WebP，单张不超过 5MB。提交即表示同意平台为实名审核目的处理上述信息。
            </p>
            <button
              type="submit"
              data-testid="real-name-submit"
              className="mt-3 h-10 w-full bg-eink-ink text-[15px] text-eink-paper active:bg-eink-pressed disabled:opacity-60"
              disabled={busy}
            >
              {busy ? '正在提交...' : '提交实名审核'}
            </button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <p data-testid="real-name-notice" className="mx-4 mt-3 text-[12px] leading-5 text-eink-sub">
          {notice}
        </p>
      ) : null}

      {admin ? (
        <div className="mt-6 px-4" data-testid="real-name-admin">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-eink-ink">实名审核</h2>
            <button
              type="button"
              className="h-8 border border-eink-line/40 px-3 text-[12px] text-eink-ink active:bg-eink-surface"
              onClick={loadAdmin}
              disabled={adminBusy}
            >
              {adminBusy ? '加载中...' : '刷新申请'}
            </button>
          </div>
          {adminRows.length === 0 ? (
            <p data-testid="real-name-admin-empty" className="mt-3 text-[12px] text-eink-sub">暂无实名申请。</p>
          ) : (
            <ul className="mt-3 divide-y divide-eink-divider/60 border border-eink-line/30 bg-eink-paper" data-testid="real-name-admin-list">
              {adminRows.map((row) => (
                <li key={row.userId} className="px-3 py-3" data-testid="real-name-admin-item">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-eink-ink">{row.realName}</p>
                      <p className="mt-0.5 break-all text-[11px] text-eink-sub">{row.idNumber}</p>
                      <p className="mt-0.5 truncate text-[11px] text-eink-faint">
                        {row.nickname || row.username || row.userId} · {row.email || '无邮箱'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-eink-sub">{realNameStatusText(row.status)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {urls[`${row.userId}:front`] ? (
                      <a href={urls[`${row.userId}:front`]} target="_blank" rel="noreferrer" className="text-[11px] text-eink-ink underline">
                        查看人像面
                      </a>
                    ) : null}
                    {urls[`${row.userId}:back`] ? (
                      <a href={urls[`${row.userId}:back`]} target="_blank" rel="noreferrer" className="text-[11px] text-eink-ink underline">
                        查看国徽面
                      </a>
                    ) : null}
                  </div>
                  {row.status === 'pending' ? (
                    <div className="mt-2">
                      <input
                        data-testid={`real-name-note-${row.userId}`}
                        className="h-9 w-full border border-eink-line/30 bg-eink-paper px-2 text-[12px] outline-none"
                        maxLength={200}
                        placeholder="驳回原因（通过时可不填）"
                        value={notes[row.userId] || ''}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [row.userId]: event.target.value }))
                        }
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          data-testid={`real-name-approve-${row.userId}`}
                          className="h-8 flex-1 bg-eink-ink text-[12px] text-eink-paper active:bg-eink-pressed disabled:opacity-60"
                          onClick={() => approve(row)}
                          disabled={adminBusy}
                        >
                          通过
                        </button>
                        <button
                          type="button"
                          data-testid={`real-name-reject-${row.userId}`}
                          className="h-8 flex-1 border border-eink-line/40 text-[12px] text-eink-ink active:bg-eink-surface disabled:opacity-60"
                          onClick={() => reject(row)}
                          disabled={adminBusy}
                        >
                          驳回
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
