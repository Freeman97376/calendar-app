import { describe, expect, it } from 'vitest'

import { localeForLanguage, translate } from '../../../../src/domain/logic/i18n'

describe('i18n', () => {
  it('translates stable UI keys in English and Chinese', () => {
    expect(translate('en', 'panel.settings')).toBe('Settings')
    expect(translate('zh', 'panel.settings')).toBe('设置')
  })

  it('interpolates params and maps languages to browser locales', () => {
    expect(
      translate('zh', 'enabled.completeFrom', { completed: 2, source: 'actions', total: 5 }),
    ).toBe('2/5 已完成，来源：actions')
    expect(localeForLanguage('en')).toBe('en-US')
    expect(localeForLanguage('zh')).toBe('zh-CN')
  })
})
