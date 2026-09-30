import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PersonalAIStatus, PersonalAIUpdate } from '../domain/schemas/personalAI.schema'
import { requestPersonalAISettings, personalAIErrorKind } from '../store/personalAIStore'
import { useAuthStore } from '../store/authStore'
import { configureRuntimeEnvironment, useConfigStore } from '../store/configStore'

type ModelName = NonNullable<PersonalAIUpdate['routineModel']>

export function usePersonalAISettings(userId: string) {
  const [saved, setSaved] = useState<PersonalAIStatus | null>(null)
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [routineModel, setRoutineModel] = useState<ModelName>('deepseek-chat')
  const [planningModel, setPlanningModel] = useState<ModelName>('deepseek-reasoner')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<'load' | 'save' | 'key' | 'unavailable' | null>(null)
  const [notice, setNotice] = useState<'saved' | 'removed' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const active = useRef(false)
  const inFlight = useRef(false)
  const requestVersion = useRef(0)
  const keyInput = useRef<HTMLInputElement>(null)

  const currentAccount = () =>
    active.current &&
    useAuthStore.getState().user?.id === userId &&
    useAuthStore.getState().status === 'authenticated'

  function acceptStatus(value: PersonalAIStatus) {
    setSaved(value)
    setRoutineModel(
      value.personalKeyConfigured && value.routineModel === 'deepseek-reasoner'
        ? 'deepseek-reasoner'
        : 'deepseek-chat',
    )
    setPlanningModel(
      value.personalKeyConfigured && value.planningModel === 'deepseek-chat'
        ? 'deepseek-chat'
        : 'deepseek-reasoner',
    )
    configureRuntimeEnvironment({
      aiRuntime: {
        ...useConfigStore.getState().aiRuntime,
        keyConfigured: value.keyConfigured,
        routineModel: value.routineModel,
        planningModel: value.planningModel,
      },
    })
  }

  useEffect(() => {
    active.current = true
    const version = ++requestVersion.current
    requestPersonalAISettings(userId, 'GET')
      .then((value) => {
        if (
          !active.current ||
          version !== requestVersion.current ||
          useAuthStore.getState().user?.id !== userId
        )
          return
        setSaved(value)
        setRoutineModel(
          value.personalKeyConfigured && value.routineModel === 'deepseek-reasoner'
            ? 'deepseek-reasoner'
            : 'deepseek-chat',
        )
        setPlanningModel(
          value.personalKeyConfigured && value.planningModel === 'deepseek-chat'
            ? 'deepseek-chat'
            : 'deepseek-reasoner',
        )
        setBusy(false)
      })
      .catch(() => {
        if (active.current && version === requestVersion.current) {
          setError('load')
          setBusy(false)
        }
      })
    return () => {
      active.current = false
      requestVersion.current += 1
    }
  }, [userId])

  function validKey() {
    const value = key.trim()
    if (
      (!value && !saved?.personalKeyConfigured) ||
      value.length > 512 ||
      /[^\x21-\x7e]/.test(value)
    ) {
      setError('key')
      return false
    }
    if (error === 'key') setError(null)
    return true
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || !currentAccount()) return
    if (!validKey()) {
      keyInput.current?.focus()
      return
    }
    await change('PATCH')
  }

  async function change(method: 'PATCH' | 'DELETE') {
    if (inFlight.current || !currentAccount()) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const value = await requestPersonalAISettings(
        userId,
        method,
        method === 'PATCH'
          ? { apiKey: key.trim() || undefined, routineModel, planningModel }
          : undefined,
      )
      if (!currentAccount()) return
      acceptStatus(value)
      setKey('')
      setShowKey(false)
      setConfirmRemove(false)
      setNotice(method === 'PATCH' ? 'saved' : 'removed')
    } catch (failure) {
      if (!currentAccount()) return
      setError(personalAIErrorKind(failure))
    } finally {
      inFlight.current = false
      if (currentAccount()) setBusy(false)
    }
  }

  return {
    saved,
    key,
    setKey,
    showKey,
    setShowKey,
    routineModel,
    setRoutineModel,
    planningModel,
    setPlanningModel,
    busy,
    error,
    setError,
    notice,
    setNotice,
    confirmRemove,
    setConfirmRemove,
    keyInput,
    validKey,
    submit,
    change,
  }
}
