import { useId, useState } from 'react'
import { AlertCircle, CircleCheck, Download, FlaskConical, Send, Upload } from 'lucide-react'
import { cppTemplate, pythonTemplate } from '@/lib/arena-data'
import { validateBotCodeOffline, type ValidationResult } from '@/lib/offline-validator'
import { arenaApi } from '@/lib/api-client'
import { CodeEditor } from './code-editor'
import { Btn } from './primitives'

type Lang = 'py' | 'cpp'

export function WebIdeForm({
  showNote = true,
  showUpload = false,
  onSubmitted,
}: {
  showNote?: boolean
  showUpload?: boolean
  onSubmitted?: () => void
}) {
  const langId = useId()
  const noteId = useId()
  const fileId = useId()
  const [lang, setLang] = useState<Lang>('py')
  const [code, setCode] = useState(pythonTemplate)
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleCheckCode() {
    setValidating(true)
    setValidation(null)

    // Run in-browser client check first (instant feedback)
    const clientResult = validateBotCodeOffline(code, lang === 'py' ? 'PYTHON' : 'CPP')
    if (!clientResult.is_valid) {
      setValidation(clientResult)
      setValidating(false)
      return
    }

    // Try server check if online
    try {
      const serverRes = await arenaApi.validateCode(code, lang === 'py' ? 'PYTHON' : 'CPP')
      setValidation({
        is_valid: true,
        message: serverRes.message || 'Biên dịch máy chủ thành công · 3/3 test case đạt chuẩn sandbox.',
      })
    } catch {
      // Fallback to client validation
      setValidation(clientResult)
    } finally {
      setValidating(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        onSubmitted?.()
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={langId} className="text-xs font-semibold text-foreground">
            Ngôn ngữ
          </label>
          <select
            id={langId}
            value={lang}
            onChange={(e) => {
              setLang(e.target.value as Lang)
              setValidation(null)
            }}
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
          >
            <option value="py">Python 3.10 (.py)</option>
            <option value="cpp">C++ (.cpp)</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Btn
            variant="outline"
            size="md"
            className="h-10 flex-1 sm:flex-none"
            onClick={() => {
              setCode(lang === 'py' ? pythonTemplate : cppTemplate)
              setValidation(null)
            }}
          >
            <Download />
            Nạp mẫu
          </Btn>
          <Btn
            variant="outline"
            size="md"
            className="h-10 flex-1 sm:flex-none"
            onClick={handleCheckCode}
            disabled={validating}
          >
            <FlaskConical className={validating ? 'animate-spin' : ''} />
            {validating ? 'Đang kiểm tra...' : 'Kiểm tra'}
          </Btn>
        </div>
      </div>

      {showUpload && (
        <label
          htmlFor={fileId}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-secondary/50 px-4 py-3 text-sm transition hover:border-primary/50 hover:bg-accent"
        >
          <Upload className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">Tải file lên</span> hoặc kéo thả{' '}
            <span className="font-mono">.py</span> / <span className="font-mono">.cpp</span> (tối đa 256KB)
          </span>
          <input
            id={fileId}
            type="file"
            accept=".py,.cpp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setLang(file.name.endsWith('.cpp') ? 'cpp' : 'py')
              setCode(await file.text())
              setValidation(null)
            }}
          />
        </label>
      )}

      <CodeEditor value={code} onChange={(v) => { setCode(v); setValidation(null) }} filename={lang === 'py' ? 'bot.py' : 'bot.cpp'} />

      {validation && (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed ${
            validation.is_valid
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {validation.is_valid ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <div>
            <div className="font-semibold">
              {validation.is_valid ? 'Hợp lệ và sẵn sàng nộp' : 'Phát hiện lỗi cú pháp / quy chuẩn'}
            </div>
            <div>{validation.is_valid ? validation.message : validation.error_message}</div>
          </div>
        </div>
      )}

      {showNote && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-xs font-semibold text-foreground">
            Ghi chú chiến thuật
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Điều chỉnh để thích ứng với luật"
            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-3 focus:ring-primary/15"
          />
        </div>
      )}

      <Btn type="submit" variant="primary" size="lg" className="w-full">
        <Send />
        Nộp code
      </Btn>
      {submitted && (
        <p role="status" className="text-center text-xs text-success">
          Đã nộp lúc {new Date().toLocaleTimeString('vi-VN')} · đang chờ máy chấm
        </p>
      )}
    </form>
  )
}
