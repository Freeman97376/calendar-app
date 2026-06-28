import type { AIMessage } from '../../hooks/useAI'

type AIMessageBubbleProps = {
  message: AIMessage
}

export default function AIMessageBubble({ message }: AIMessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={['flex', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      <div
        className={[
          'max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm',
          isUser ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800',
        ].join(' ')}
      >
        {message.content}
      </div>
    </div>
  )
}
