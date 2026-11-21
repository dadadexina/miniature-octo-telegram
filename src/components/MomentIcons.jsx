export function ThumbIcon({ filled = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 10v9H4.5A1.5 1.5 0 0 1 3 17.5v-6A1.5 1.5 0 0 1 4.5 10H7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M7 10.4 10.9 4c1.7.2 2.7 1.5 2.7 3.2v2.3h4.1c1.2 0 2 1.1 1.8 2.2l-1.1 6A2 2 0 0 1 16.4 19H7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

export function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4 3.2V6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}
