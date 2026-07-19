import { useState } from 'react'

import { useDataPortability } from '../../hooks/useDataPortability'
import Button from '../ui/Button'

export default function DataPortabilityPanel() {
  const data = useDataPortability()
  const [file, setFile] = useState<File | null>(null)

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">Backup and restore / 备份与恢复</h3>
        <p className="mt-1 text-sm text-slate-600">
          Backup files contain personal app data, but never passwords, sessions, or AI API keys.
          / 备份包含个人应用数据，但不包含密码、会话或 AI 密钥。
        </p>
      </div>
      <Button disabled={data.isBusy} onClick={() => void data.exportBackup()} variant="secondary">
        Export backup / 导出备份
      </Button>
      <Button disabled={data.isBusy} onClick={() => void data.exportLegacy()} variant="secondary">
        Export legacy browser data / 导出旧浏览器数据
      </Button>
      <input
        accept="application/json,.json"
        aria-label="Choose Calendar backup / 选择日历备份"
        className="block w-full text-sm text-slate-700"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        type="file"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!file || data.isBusy}
          onClick={() => file && void data.importBackup(file, 'merge')}
          variant="primary"
        >
          Merge import / 合并导入
        </Button>
        <Button
          disabled={!file || data.isBusy}
          onClick={() => {
            if (file && window.confirm('Replace all current personal data? / 确认替换全部当前个人数据？')) {
              void data.importBackup(file, 'replace')
            }
          }}
          variant="danger"
        >
          Replace restore / 覆盖恢复
        </Button>
      </div>
      {data.error ? <p className="text-sm text-red-700">{data.error}</p> : null}
      {data.status ? <p className="text-sm text-emerald-800">{data.status}</p> : null}
    </section>
  )
}
