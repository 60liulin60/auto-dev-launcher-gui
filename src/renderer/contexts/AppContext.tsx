import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import { ProjectHistoryEntry, ServerState } from '../types'

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
  dispatch: React.Dispatch<AppAction>
  // 便捷方法
  loadProjects: (projects: ProjectHistoryEntry[]) => void
  addProject: (project: ProjectHistoryEntry) => void
  removeProject: (projectId: string) => void
  updateProject: (id: string, updates: Partial<ProjectHistoryEntry>) => void
  setSelectedProject: (projectId: string | null) => void
  setSelectedFolder: (folder: string | null) => void
  updateServerState: (projectId: string, serverState: ServerState) => void
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

  // 便捷方法
  const contextValue: AppContextType = {
    state,
    dispatch,
    loadProjects: (projects) => dispatch({ type: 'LOAD_PROJECTS', payload: projects }),
    addProject: (project) => dispatch({ type: 'ADD_PROJECT', payload: project }),
    removeProject: (projectId) => dispatch({ type: 'REMOVE_PROJECT', payload: projectId }),
    updateProject: (id, updates) => dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates } }),
    setSelectedProject: (projectId) => dispatch({ type: 'SET_SELECTED_PROJECT', payload: projectId }),
    setSelectedFolder: (folder) => dispatch({ type: 'SET_SELECTED_FOLDER', payload: folder }),
    updateServerState: (projectId, serverState) => dispatch({
      type: 'UPDATE_SERVER_STATE',
      payload: { projectId, serverState }
    }),
    setLoading: (loading) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error) => dispatch({ type: 'SET_ERROR', payload: error }),
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),
    getServerState: (projectId) => state.serverStates.get(projectId) || { status: 'idle' as ServerStatus, output: [] }
  }

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
