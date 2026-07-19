import { useAuth } from '../../hooks/useAuth'
import Button from '../ui/Button'

export default function AccountBar() {
  const auth = useAuth()
  if (!auth.authRequired || !auth.user) return null

  return (
    <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
      <span>
        {auth.user.username} · {auth.user.role}
      </span>
      <Button onClick={() => void auth.logout()} variant="secondary">
        Sign out / 退出
      </Button>
    </div>
  )
}
