import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
}

export default function Button({
  children,
  className = '',
  variant = 'secondary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        className,
      ].join(' ')}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}
