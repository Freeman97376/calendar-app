import { useAuth } from '../../hooks/useAuth'
import Button from '../ui/Button'
import { useI18n } from '../../hooks/useI18n'

export default function AccountBar() {
  const auth = useAuth()
  const { t } = useI18n()
  if (!auth.authRequired || !auth.user) return null

  return (
    <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
      <span>
        {auth.user.username} {'\u00b7'} {auth.user.role}
      </span>
      <Button
        disabled={auth.isSubmitting}
        onClick={() => void auth.logout().catch(() => undefined)}
        variant="secondary"
      >
        {t('auth.signOut')}
      </Button>
    </div>
  )
}
