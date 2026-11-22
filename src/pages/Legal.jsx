import { Link, useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'
import useSwipeBack from '../hooks/useSwipeBack'
import { goBackOr } from '../lib/navigation'

const TERMS = {
  title: '用户协议',
  updated: '2026-11-22',
  sections: [
    ['服务说明', '「纸墨信笺」是一款面向熟人社交的轻量级即时通讯应用，提供账号注册、资料管理、好友添加与一对一文字、语音消息及语音通话功能。'],
    ['账号规则', '你需要使用有效邮箱注册并设置自定义 ID。请妥善保管账号与密码，因保管不善造成的损失由账号持有人自行承担。你可以随时在「设置 → 账号安全 → 注销账号」中删除账号及全部云端数据。'],
    ['行为规范', '禁止利用本服务发送违法违规、骚扰、侵权或垃圾信息。违反规范的账号可能被限制或注销。'],
    ['免责声明', '消息数据存储于第三方云服务（Supabase），我们会持续维护服务稳定性，但不承诺数据永久留存。因不可抗力、云服务故障导致的数据丢失，本服务在合理范围内不承担赔偿责任。'],
    ['协议变更', '协议更新后将在本页面公布并修订「更新日期」。继续使用本服务视为接受变更。'],
  ],
}

const PRIVACY = {
  title: '隐私政策',
  updated: '2026-11-22',
  sections: [
    ['我们收集的信息', '注册邮箱、昵称、自定义 ID、你与好友互发的消息内容及时间戳、账号创建时间。除上述内容外，我们不收集通讯录、位置、设备标识等其他个人信息。'],
    ['信息的使用', '仅用于实现账号登录、资料展示、好友搜索与消息收发功能，不用于广告投放或用户画像。'],
    ['信息的存储与保护', '数据存储于 Supabase 云服务（欧盟/美国区域可选），启用行级安全策略（RLS）：消息仅聊天双方可读，资料仅本人可修改。传输全程使用 HTTPS/TLS 加密。'],
    ['第三方共享', '我们不会向任何第三方出售、出租或共享你的个人信息，法律法规要求的除外。'],
    ['你的权利', '你可以随时在应用内修改昵称，或在「设置 → 账号安全 → 注销账号」中永久删除账号及关联的头像、朋友圈图片与聊天媒体文件，且不可恢复。'],
    ['联系我们', '对本政策有疑问，可通过项目仓库的 Issues 渠道反馈。'],
  ],
}

export default function Legal({ kind = 'terms' }) {
  const navigate = useNavigate()
  useSwipeBack(() => goBackOr(navigate, '/login'))
  const doc = kind === 'privacy' ? PRIVACY : TERMS
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-eink-paper">
      <NavBar title={doc.title} left={<Link to="/login" className="px-4 py-3 text-[15px] text-eink-sub">‹ 返回</Link>} />
      <div className="px-6 pb-12 pt-4">
        <p className="text-[12px] text-eink-sub">更新日期：{doc.updated}</p>
        {doc.sections.map(([heading, body]) => (
          <section key={heading} className="mt-6">
            <h2 className="text-[15px] font-medium text-eink-ink">{heading}</h2>
            <p className="mt-2 text-[13px] leading-6 text-eink-sub">{body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
