export interface PythonExecutableOptions {
  env?: Record<string, string | undefined>
  platform?: string
  root?: string
}

export function resolvePythonExecutable(options?: PythonExecutableOptions): string
