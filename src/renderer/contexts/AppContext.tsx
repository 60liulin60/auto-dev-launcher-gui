import React, { createContext, useCallback, useContext, useMemo, useReducer, ReactNode } from 'react'
import { ProjectHistoryEntry, ServerState, ServerStatus } from '../types'

// 应用状态接口
export interface AppState {
  projects: ProjectHistoryEntry[]
  serverStates: Map<string, ServerState>
  selectedProjectId: string | null
  selectedFolder: string | null
  isLoading: boolean
  error: string | null
}

// 应用动作类型
export type AppAction =
  | { type: 'LOAD_PROJECTS'; payload: ProjectHistoryEntry[] }
  | { type: 'ADD_PROJECT'; payload: ProjectHistoryEntry }
  | { type: 'REMOVE_PROJECT'; payload: string }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<ProjectHistoryEntry> } }
  | { type: 'SET_SELECTED_PROJECT'; payload: string | null }
  | { type: 'SET_SELECTED_FOLDER'; payload: string | null }
  | { type: 'UPDATE_SERVER_STATE'; payload: { projectId: string; state: ServerState } }
  | { type: 'UPDATE_SERVER_STATE_FUNCTIONAL'; payload: { projectId: string; updater: (currentState: ServerState) => ServerState } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }

// 初始状态
const initialState: AppState = {
  projects: [],
  serverStates: new Map(),
  selectedProjectId: null,
  selectedFolder: null,
  isLoading: false,
  error: null
}

// Reducer函数
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_PROJECTS':
      return {
        ...state,
        projects: action.payload
      }

    case 'ADD_PROJECT':
      return {
        ...state,
        projects: [...state.projects, action.payload]
      }

    case 'REMOVE_PROJECT':
      const newServerStates = new Map(state.serverStates)
      newServerStates.delete(action.payload)
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== action.payload),
        serverStates: newServerStates,
        selectedProjectId: state.selectedProjectId === action.payload ? null : state.selectedProjectId
      }

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map(p =>
          p.id === action.payload.id
            ? { ...p, ...action.payload.updates }
            : p
        )
      }

    case 'SET_SELECTED_PROJECT':
      return {
        ...state,
        selectedProjectId: action.payload
      }

    case 'SET_SELECTED_FOLDER':
      return {
        ...state,
        selectedFolder: action.payload
      }

    case 'UPDATE_SERVER_STATE':
      const updatedServerStates = new Map(state.serverStates)
      updatedServerStates.set(action.payload.projectId, action.payload.state)
      return {
        ...state,
        serverStates: updatedServerStates
      }

    case 'UPDATE_SERVER_STATE_FUNCTIONAL':
      const functionalUpdatedStates = new Map(state.serverStates)
      const currentState = functionalUpdatedStates.get(action.payload.projectId) || { status: 'idle' as ServerStatus, output: [] }
      const newState = action.payload.updater(currentState)
      functionalUpdatedStates.set(action.payload.projectId, newState)
      return {
        ...state,
        serverStates: functionalUpdatedStates
      }

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload
      }

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false
      }

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      }

    default:
      return state
  }
}

// Context类型
interface AppContextType {
  state: AppState
  // 便捷方法
  loadProjects: (projects: ProjectHistoryEntry[]) => void
  addProject: (project: ProjectHistoryEntry) => void
  removeProject: (projectId: string) => void
  updateProject: (id: string, updates: Partial<ProjectHistoryEntry>) => void
  setSelectedProject: (projectId: string | null) => void
  setSelectedFolder: (folder: string | null) => void
  updateServerState: (projectId: string, serverState: ServerState) => void
  updateServerStateWith: (projectId: string, updater: (currentState: ServerState) => ServerState) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  getServerState: (projectId: string) => ServerState
}

// 创建Context
const AppContext = createContext<AppContextType | undefined>(undefined)

// Provider组件
interface AppProviderProps {
  children: ReactNode
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState)

  const loadProjects = useCallback((projects: ProjectHistoryEntry[]) => {
    dispatch({ type: 'LOAD_PROJECTS', payload: projects })
  }, [])

  const addProject = useCallback((project: ProjectHistoryEntry) => {
    dispatch({ type: 'ADD_PROJECT', payload: project })
  }, [])

  const removeProject = useCallback((projectId: string) => {
    dispatch({ type: 'REMOVE_PROJECT', payload: projectId })
  }, [])

  const updateProject = useCallback((id: string, updates: Partial<ProjectHistoryEntry>) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates } })
  }, [])

  const setSelectedProject = useCallback((projectId: string | null) => {
    dispatch({ type: 'SET_SELECTED_PROJECT', payload: projectId })
  }, [])

  const setSelectedFolder = useCallback((folder: string | null) => {
    dispatch({ type: 'SET_SELECTED_FOLDER', payload: folder })
  }, [])

  const updateServerState = useCallback((projectId: string, serverState: ServerState) => {
    dispatch({
      type: 'UPDATE_SERVER_STATE',
      payload: { projectId, state: serverState }
    })
  }, [])

  // Keep derived updates inside the provider so render code does not need raw dispatch access.
  const updateServerStateWith = useCallback((projectId: string, updater: (currentState: ServerState) => ServerState) => {
    dispatch({
      type: 'UPDATE_SERVER_STATE_FUNCTIONAL',
      payload: { projectId, updater }
    })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [])

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error })
  }, [])

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' })
  }, [])

  const getServerState = useCallback((projectId: string) => {
    return state.serverStates.get(projectId) || { status: 'idle' as ServerStatus, output: [] }
  }, [state.serverStates])

  const contextValue = useMemo<AppContextType>(() => ({
    state,
    loadProjects,
    addProject,
    removeProject,
    updateProject,
    setSelectedProject,
    setSelectedFolder,
    updateServerState,
    updateServerStateWith,
    setLoading,
    setError,
    clearError,
    getServerState
  }), [
    state,
    loadProjects,
    addProject,
    removeProject,
    updateProject,
    setSelectedProject,
    setSelectedFolder,
    updateServerState,
    updateServerStateWith,
    setLoading,
    setError,
    clearError,
    getServerState
  ])

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  )
}

// 使用Context的Hook
export const useApp = (): AppContextType => {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

// 选择器Hooks - 用于优化性能，只订阅需要的状态
export const useProjects = () => {
  const { state } = useApp()
  return state.projects
}

export const useServerStates = () => {
  const { state } = useApp()
  return state.serverStates
}

export const useSelectedProject = () => {
  const { state, setSelectedProject } = useApp()
  return {
    selectedProjectId: state.selectedProjectId,
    setSelectedProject
  }
}

export const useSelectedFolder = () => {
  const { state, setSelectedFolder } = useApp()
  return {
    selectedFolder: state.selectedFolder,
    setSelectedFolder
  }
}

export const useLoading = () => {
  const { state, setLoading } = useApp()
  return {
    isLoading: state.isLoading,
    setLoading
  }
}

export const useError = () => {
  const { state, setError, clearError } = useApp()
  return {
    error: state.error,
    setError,
    clearError
  }
}
