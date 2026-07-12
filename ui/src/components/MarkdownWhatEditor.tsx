import { useCallback, useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import {
  Bold,
  Braces,
  Code2,
  FileCode2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react'

type Mode = 'rich' | 'source'

interface MarkdownWhatEditorProps {
  value: string
  saving: boolean
  onSave: (what: string) => Promise<boolean>
  onCancel: () => void
}

interface ToolbarButtonProps {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolbarButton({ label, active = false, disabled = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-bg-tertiary hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A real rich-text editing surface backed by Tiptap/ProseMirror while Markdown
 * remains the storage and API contract. Source mode is deliberately retained:
 * agents may author advanced Markdown that a visual editor cannot represent
 * perfectly, and opening the UI must never make that content inaccessible.
 */
export function MarkdownWhatEditor({ value, saving, onSave, onCancel }: MarkdownWhatEditorProps) {
  const [mode, setMode] = useState<Mode>('rich')
  const [source, setSource] = useState(value)
  const [richDirty, setRichDirty] = useState(false)

  const extensions = useMemo(() => [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    Markdown.configure({ markedOptions: { breaks: true, gfm: true } }),
  ], [])

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    onUpdate: () => setRichDirty(true),
    editorProps: {
      attributes: {
        'aria-label': 'Issue What rich text editor',
        spellcheck: 'true',
      },
    },
  })

  useEffect(() => {
    setSource(value)
    setRichDirty(false)
    editor?.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [editor, value])

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      code: current?.isActive('code') ?? false,
      codeBlock: current?.isActive('codeBlock') ?? false,
      heading: current?.isActive('heading', { level: 2 }) ?? false,
      bulletList: current?.isActive('bulletList') ?? false,
      orderedList: current?.isActive('orderedList') ?? false,
      blockquote: current?.isActive('blockquote') ?? false,
      link: current?.isActive('link') ?? false,
      canUndo: current?.can().chain().focus().undo().run() ?? false,
      canRedo: current?.can().chain().focus().redo().run() ?? false,
    }),
  })

  const current = mode === 'source' ? source : editor?.getMarkdown() ?? value
  const changed = mode === 'source' ? source.trim() !== value.trim() : richDirty

  const switchMode = useCallback((next: Mode) => {
    if (!editor || next === mode) return
    if (next === 'source') {
      // Do not turn harmless parser/serializer normalization into a fake edit.
      // Until the user changes rich content, source mode shows their exact bytes.
      setSource(richDirty ? editor.getMarkdown() : value)
    } else {
      editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false })
      setRichDirty(source.trim() !== value.trim())
      editor.commands.focus()
    }
    setMode(next)
  }, [editor, mode, richDirty, source, value])

  const save = useCallback(async () => {
    const markdown = (mode === 'source' ? source : editor?.getMarkdown() ?? value).trim()
    if (!markdown || saving) return
    await onSave(markdown)
  }, [editor, mode, onSave, saving, source, value])

  const editLink = useCallback(() => {
    if (!editor) return
    const previous = editor.getAttributes('link').href as string | undefined
    const href = window.prompt('Link URL', previous ?? 'https://')
    if (href === null) return
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
  }, [editor])

  return (
    <div className="overflow-hidden rounded-xl border border-accent/35 bg-bg shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_8%,transparent)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-secondary/75 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5" aria-label="Formatting tools">
          <ToolbarButton label="Bold" active={state?.bold} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></ToolbarButton>
          <ToolbarButton label="Italic" active={state?.italic} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolbarButton>
          <ToolbarButton label="Inline code" active={state?.code} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton label="Heading" active={state?.heading} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolbarButton>
          <ToolbarButton label="Bullet list" active={state?.bulletList} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></ToolbarButton>
          <ToolbarButton label="Ordered list" active={state?.orderedList} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolbarButton>
          <ToolbarButton label="Quote" active={state?.blockquote} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={15} /></ToolbarButton>
          <ToolbarButton label="Code block" active={state?.codeBlock} disabled={!editor || mode === 'source'} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><FileCode2 size={15} /></ToolbarButton>
          <ToolbarButton label="Link" active={state?.link} disabled={!editor || mode === 'source'} onClick={editLink}><Link2 size={15} /></ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton label="Undo" disabled={!state?.canUndo || mode === 'source'} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></ToolbarButton>
          <ToolbarButton label="Redo" disabled={!state?.canRedo || mode === 'source'} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></ToolbarButton>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-bg p-0.5 text-[11px]">
          <button type="button" onClick={() => switchMode('rich')} className={`rounded-md px-2 py-1 ${mode === 'rich' ? 'bg-bg-tertiary text-text' : 'text-muted hover:text-text'}`}>Visual</button>
          <button type="button" onClick={() => switchMode('source')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${mode === 'source' ? 'bg-bg-tertiary text-text' : 'text-muted hover:text-text'}`}><Braces size={11} /> Markdown</button>
        </div>
      </div>

      {mode === 'rich' ? (
        <EditorContent editor={editor} className="markdown-content what-editor-content" />
      ) : (
        <textarea
          autoFocus
          value={source}
          onChange={(event) => setSource(event.target.value)}
          aria-label="Issue What Markdown source"
          spellCheck={false}
          className="min-h-80 w-full resize-y bg-bg px-5 py-4 font-mono text-[13px] leading-relaxed text-text outline-none"
        />
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-bg-secondary/55 px-3 py-2">
        <p className="text-[11px] text-muted/65">
          {mode === 'rich' ? 'Formatting is saved as Markdown.' : 'Source mode preserves advanced Markdown exactly.'}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-md px-2.5 py-1.5 text-xs text-muted hover:text-text disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving || !current.trim() || !changed} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Saving…' : 'Save What'}
          </button>
        </div>
      </div>
    </div>
  )
}
