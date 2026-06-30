import { useCallback, useMemo } from 'react'

import { localeForLanguage, translate, type TranslationKey } from '../domain/logic/i18n'
import { useConfigStore } from '../store/configStore'

export function useI18n() {
  const language = useConfigStore((state) => state.config.language)
  const locale = useMemo(() => localeForLanguage(language), [language])
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  )
  const translateForLanguage = useCallback(
    (
      targetLanguage: typeof language,
      key: TranslationKey,
      params?: Record<string, string | number>,
    ) => translate(targetLanguage, key, params),
    [],
  )

  return { language, locale, t, translateForLanguage }
}
