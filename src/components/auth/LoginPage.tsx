import { useState, type FormEvent } from 'react'

import { useAuth } from '../../hooks/useAuth'
import Button from '../ui/Button'

export default function LoginPage() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await auth.login(username, password).catch(() => undefined)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Calendar App</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sign in / 登录</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use the account created by the server administrator. Registration is not available.
          <br />请使用服务器管理员创建的账号，本系统暂不开放注册。
        </p>
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-username">
            Username / 账号
            <input
              autoComplete="username"
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="login-username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-password">
            Password / 密码
            <input
              autoComplete="current-password"
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="login-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {auth.error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{auth.error}</p> : null}
          <Button className="w-full" disabled={auth.status === 'loading'} type="submit">
            {auth.status === 'loading' ? 'Signing in… / 登录中…' : 'Sign in / 登录'}
          </Button>
        </form>
      </section>
    </main>
  )
}
