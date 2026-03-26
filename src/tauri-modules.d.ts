declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T>
}

declare module '@tauri-apps/api/event' {
  export type EventCallback<T> = (event: { payload: T }) => void

  export function listen<T = unknown>(
    event: string,
    handler: EventCallback<T>
  ): Promise<() => void>
}

declare module '@tauri-apps/plugin-dialog' {
  export interface OpenDialogOptions {
    directory?: boolean
    multiple?: boolean
    title?: string
  }

  export function open(
    options?: OpenDialogOptions
  ): Promise<string | string[] | null>
}
