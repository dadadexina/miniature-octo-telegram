import { createContext, useContext } from 'react'

export const CallContext = createContext(null)

export function useCallCenter() {
  return useContext(CallContext) || { startCall: () => {}, status: 'idle' }
}
