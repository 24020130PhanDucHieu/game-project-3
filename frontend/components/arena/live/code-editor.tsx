'use client'

import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder as placeholderExt } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { tags as t } from '@lezer/highlight'
import { useTheme } from '@/lib/theme'

type Palette = { keyword: string; string: string; number: string; comment: string; fn: string; type: string; op: string; variable: string; constant: string }

const DARK: Palette = { keyword: '#c4a7ff', string: '#9be28b', number: '#ffb86b', comment: '#6f7bb0', fn: '#7fd4ff', type: '#ffd479', op: '#ff7eb6', variable: '#e8ebff', constant: '#ff9e80' }
const LIGHT: Palette = { keyword: '#7c3aed', string: '#15803d', number: '#c2410c', comment: '#64748b', fn: '#0369a1', type: '#a16207', op: '#be185d', variable: '#1e293b', constant: '#b91c1c' }

function highlight(p: Palette) {
  return syntaxHighlighting(HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: p.keyword, fontWeight: '600' },
    { tag: [t.string, t.special(t.string), t.regexp], color: p.string },
    { tag: [t.number, t.bool, t.null], color: p.number },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docString], color: p.comment, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: p.fn },
    { tag: [t.typeName, t.className, t.namespace], color: p.type },
    { tag: [t.operator, t.punctuation, t.separator], color: p.op },
    { tag: [t.variableName, t.propertyName, t.name], color: p.variable },
    { tag: [t.standard(t.variableName), t.constant(t.variableName), t.self, t.atom], color: p.constant },
    { tag: [t.processingInstruction, t.meta], color: p.keyword },
  ]))
}

function chrome(dark: boolean) {
  return EditorView.theme({
    '&': { backgroundColor: 'transparent', color: 'var(--foreground)', fontSize: '13px', height: '100%' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65', overflow: 'auto' },
    '.cm-content': { caretColor: 'var(--primary)', padding: '10px 0' },
    '.cm-cursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: 'none', paddingLeft: '4px' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 6px', minWidth: '2.2em' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--primary) 9%, transparent)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--primary)', fontWeight: '700' },
    '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--primary) 30%, transparent)' },
    '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--cyan) 28%, transparent)', outline: '1px solid var(--cyan)' },
    '.cm-placeholder': { color: 'var(--muted-foreground)', opacity: '0.6' },
  }, { dark })
}

export type EditorLanguage = 'PYTHON' | 'CPP'

/** Trình soạn code CodeMirror 6: tô màu cú pháp, số dòng, tự thụt lề, bắt cặp ngoặc. */
export default function CodeEditor({ value, onChange, language, placeholder, invalid, onCursor, minHeight = 340 }: {
  value: string
  onChange: (value: string) => void
  language: EditorLanguage
  placeholder?: string
  invalid?: boolean
  onCursor?: (line: number, col: number) => void
  minHeight?: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const langC = useRef(new Compartment())
  const themeC = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  onChangeRef.current = onChange
  onCursorRef.current = onCursor
  const { resolved } = useTheme()

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorState.tabSize.of(4),
        placeholderExt(placeholder || ''),
        langC.current.of(language === 'CPP' ? cpp() : python()),
        themeC.current.of([chrome(resolved === 'dark'), highlight(resolved === 'dark' ? DARK : LIGHT)]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            const line = update.state.doc.lineAt(head)
            onCursorRef.current?.(line.number, head - line.from + 1)
          }
        }),
      ],
    })
    view.current = new EditorView({ state, parent: host.current })
    return () => { view.current?.destroy(); view.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Đồng bộ nội dung khi cha đổi (nạp mẫu, tải GitHub, đổi bản nháp) mà không đặt lại con trỏ khi đang gõ.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: langC.current.reconfigure(language === 'CPP' ? cpp() : python()) })
  }, [language])

  useEffect(() => {
    const dark = resolved === 'dark'
    view.current?.dispatch({ effects: themeC.current.reconfigure([chrome(dark), highlight(dark ? DARK : LIGHT)]) })
  }, [resolved])

  return (
    <div
      ref={host}
      aria-invalid={invalid}
      style={{ minHeight, height: minHeight }}
      className={`overflow-hidden rounded-xl border bg-gradient-to-b from-card to-background/60 shadow-inner transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 ${invalid ? 'border-red-500/60' : 'border-input'}`}
    />
  )
}
