import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.warn('[ErrorBoundary]', error?.message || error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center bg-eink-paper px-10 text-center">
        <p className="text-[17px] font-medium text-eink-ink">页面出现了意外问题</p>
        <p className="mt-2 text-[13px] leading-5 text-eink-sub">刷新即可恢复，本地消息不会丢失。</p>
        <button
          type="button"
          className="mt-8 h-10 rounded-none bg-eink-ink px-6 text-[15px] text-eink-paper active:bg-eink-pressed"
          onClick={() => window.location.reload()}
        >
          重新加载
        </button>
      </div>
    )
  }
}
