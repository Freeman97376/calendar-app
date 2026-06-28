import { useConfigStore } from '../store/configStore'

export function useRuntimeConfig() {
  return useConfigStore((state) => state.config)
}
