import { useEffect, useState } from 'react'

export default function useKeyboardInset() {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined

    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setInset(Math.round(overlap))
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('orientationchange', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return inset
}
