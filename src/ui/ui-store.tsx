/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ActiveModal } from '../domain/types'

type UiStateValue = {
  activeModal: ActiveModal
  debugPanelOpen: boolean
  selectedScenarioId: string
  notice: string | null
  setActiveModal: (modal: ActiveModal) => void
  setDebugPanelOpen: (open: boolean) => void
  setSelectedScenarioId: (id: string) => void
  pushNotice: (message: string) => void
}

const UiStateContext = createContext<UiStateValue | null>(null)

export function UiStateProvider({
  children,
  initialModal = null,
  initialScenarioId = 'first_install_default',
  initialDebugPanelOpen = false,
}: PropsWithChildren<{
  initialModal?: ActiveModal
  initialScenarioId?: string
  initialDebugPanelOpen?: boolean
}>) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(initialModal)
  const [debugPanelOpen, setDebugPanelOpen] = useState(initialDebugPanelOpen)
  const [selectedScenarioId, setSelectedScenarioId] = useState(initialScenarioId)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setNotice(null)
    }, 2800)

    return () => window.clearTimeout(timer)
  }, [notice])

  const value = useMemo(
    () => ({
      activeModal,
      debugPanelOpen,
      selectedScenarioId,
      notice,
      setActiveModal,
      setDebugPanelOpen,
      setSelectedScenarioId,
      pushNotice: (message: string) => setNotice(message),
    }),
    [activeModal, debugPanelOpen, notice, selectedScenarioId],
  )

  return (
    <UiStateContext.Provider value={value}>{children}</UiStateContext.Provider>
  )
}

export function useUiState() {
  const context = useContext(UiStateContext)

  if (!context) {
    throw new Error('useUiState must be used within UiStateProvider')
  }

  return context
}
