export default function PullIndicator({ pull, refreshing, threshold, testId = 'pull-indicator' }) {
  const height = refreshing ? 40 : pull
  const label = refreshing ? '刷新中...' : pull >= threshold ? '松手刷新' : pull > 0 ? '下拉刷新' : ''
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-center overflow-hidden text-[12px] text-eink-sub"
      style={{ height }}
    >
      {label}
    </div>
  )
}
