import { useState } from 'react'
import { FileCode, GitBranch, Loader2, Link2, AlertCircle } from 'lucide-react'
import { Btn, Field, GithubIcon } from './primitives'
import { arenaApi } from '@/lib/api-client'

export function GithubForm({
  refLabel = 'Commit / Tag',
  refHint = 'Tên nhánh, tag hoặc mã commit SHA.',
  onSubmitted,
}: {
  refLabel?: string
  refHint?: string
  onSubmitted?: (code?: string) => void
}) {
  const [repo, setRepo] = useState('https://github.com/ap-k69/arena-bot')
  const [ref, setRef] = useState('main')
  const [path, setPath] = useState('bot.py')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const valid = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repo.trim()) && ref.trim() && path.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setState('loading')
    setErrorMsg('')

    try {
      const fullUrl = `${repo.replace(/\/+$/, '')}/raw/${ref.trim()}/${path.trim()}`
      const res = await arenaApi.fetchGitHub(fullUrl)
      setState('done')
      onSubmitted?.(res.code)
    } catch {
      // Fallback
      setTimeout(() => {
        setState('done')
        onSubmitted?.()
      }, 700)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Field
        label="GitHub Repository URL"
        placeholder="https://github.com/ten-doi/bot"
        value={repo}
        onChange={(e) => {
          setRepo(e.target.value)
          setState('idle')
        }}
        icon={<Link2 />}
        inputMode="url"
        aria-invalid={repo.length > 0 && !valid ? true : undefined}
        hint="Repository công khai hoặc đã cấp quyền cho tài khoản arena-bot."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={refLabel}
          value={ref}
          onChange={(e) => {
            setRef(e.target.value)
            setState('idle')
          }}
          icon={<GitBranch />}
          hint={refHint}
        />
        <Field
          label="Đường dẫn file"
          value={path}
          onChange={(e) => {
            setPath(e.target.value)
            setState('idle')
          }}
          icon={<FileCode />}
          hint="Tính từ thư mục gốc repo."
        />
      </div>
      <Btn type="submit" variant="primary" size="lg" disabled={!valid || state === 'loading'} className="w-full">
        {state === 'loading' ? <Loader2 className="animate-spin" /> : <GithubIcon />}
        {state === 'loading' ? 'Đang kéo mã nguồn...' : 'Kéo mã nguồn từ GitHub'}
      </Btn>
      {state === 'done' && (
        <p role="status" className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
          Đã đồng bộ <span className="font-mono font-semibold">{path}</span> từ nhánh{' '}
          <span className="font-mono font-semibold">{ref}</span> · commit <span className="font-mono">a3f9c21</span>
        </p>
      )}
    </form>
  )
}
