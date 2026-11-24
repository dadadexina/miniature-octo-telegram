import { createContext, useContext } from 'react'

export const CallContext = createContext(null)

const EMPTY_ONLINE_IDS = new Set()

export function useCallCenter() {
  return useContext(CallContext) || { startCall: () => {}, status: 'idle', onlineIds: EMPTY_ONLINE_IDS }
}
