import type { ProfileContent, SnapshotContent } from '../../integrations/supabase/types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EditableProfileState {
  candidateName: string
  english: ProfileContent
  japanese: ProfileContent
}

interface Props {
  state: EditableProfileState
  clientCompany: string
  onChange: (updated: EditableProfileState) => void
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function updateEnglish(
  prev: EditableProfileState,
  patch: Partial<ProfileContent>,
): EditableProfileState {
  return { ...prev, english: { ...prev.english, ...patch } }
}

function updateJapanese(
  prev: EditableProfileState,
  patch: Partial<ProfileContent>,
): EditableProfileState {
  return { ...prev, japanese: { ...prev.japanese, ...patch } }
}

function updateEnglishSnapshot(
  prev: EditableProfileState,
  patch: Partial<SnapshotContent>,
): EditableProfileState {
  return { ...prev, english: { ...prev.english, snapshot: { ...prev.english.snapshot, ...patch } } }
}

function updateJapaneseSnapshot(
  prev: EditableProfileState,
  patch: Partial<SnapshotContent>,
): EditableProfileState {
  return { ...prev, japanese: { ...prev.japanese, snapshot: { ...prev.japanese.snapshot, ...patch } } }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ text, isJapanese }: { text: string; isJapanese?: boolean }) {
  return (
    <div
      style={{
        fontSize: '9px',
        fontWeight: 500,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--subtle-foreground)',
        marginBottom: '6px',
        fontFamily: isJapanese
          ? "'Noto Sans JP', 'DM Sans', system-ui, sans-serif"
          : "'DM Sans', system-ui, sans-serif",
      }}
    >
      {text}
    </div>
  )
}

interface EditableTextProps {
  value: string
  onChange: (v: string) => void
  isJapanese?: boolean
  placeholder?: string
  minRows?: number
}

function EditableText({ value, onChange, isJapanese, placeholder, minRows = 2 }: EditableTextProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      style={{
        width: '100%',
        resize: 'vertical',
        border: 'none',
        outline: 'none',
        backgroundColor: 'transparent',
        fontSize: '12px',
        lineHeight: '1.7',
        color: 'var(--foreground)',
        fontFamily: isJapanese
          ? "'Noto Sans JP', 'DM Sans', system-ui, sans-serif"
          : "'DM Sans', system-ui, sans-serif",
        padding: '4px 6px',
        borderRadius: '4px',
        transition: 'background-color 0.15s',
      }}
      onFocus={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)' }}
      onBlur={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
    />
  )
}

interface SnapshotFieldProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  isJapanese?: boolean
  bold?: boolean
}

function SnapshotField({ value, onChange, placeholder, isJapanese, bold }: SnapshotFieldProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        border: 'none',
        outline: 'none',
        backgroundColor: 'transparent',
        fontSize: bold ? '13px' : '11px',
        fontWeight: bold ? 500 : 400,
        color: bold ? 'var(--foreground)' : 'var(--muted-foreground)',
        fontFamily: isJapanese
          ? "'Noto Sans JP', 'DM Sans', system-ui, sans-serif"
          : "'DM Sans', system-ui, sans-serif",
        minWidth: '60px',
        maxWidth: '220px',
        padding: '2px 4px',
        borderRadius: '3px',
        transition: 'background-color 0.15s',
      }}
      onFocus={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)' }}
      onBlur={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
    />
  )
}

interface BulletsEditorProps {
  bullets: string[]
  onChange: (bullets: string[]) => void
  isJapanese?: boolean
}

function BulletsEditor({ bullets, onChange, isJapanese }: BulletsEditorProps) {
  const text = bullets.join('\n')
  return (
    <textarea
      value={text}
      onChange={(e) => {
        const lines = e.target.value.split('\n').filter((l) => l.trim().length > 0)
        onChange(lines)
      }}
      placeholder="One bullet per line"
      rows={Math.max(bullets.length, 3)}
      style={{
        width: '100%',
        resize: 'vertical',
        border: 'none',
        outline: 'none',
        backgroundColor: 'transparent',
        fontSize: '12px',
        lineHeight: '1.8',
        color: 'var(--foreground)',
        fontFamily: isJapanese
          ? "'Noto Sans JP', 'DM Sans', system-ui, sans-serif"
          : "'DM Sans', system-ui, sans-serif",
        padding: '4px 6px',
        borderRadius: '4px',
        transition: 'background-color 0.15s',
      }}
      onFocus={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)' }}
      onBlur={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
    />
  )
}

// ── Profile half ───────────────────────────────────────────────────────────────

interface ProfileHalfProps {
  content: ProfileContent
  clientCompany: string
  isJapanese?: boolean
  onSnapshotChange: (patch: Partial<SnapshotContent>) => void
  onContentChange: (patch: Partial<ProfileContent>) => void
}

function ProfileHalf({
  content,
  clientCompany,
  isJapanese,
  onSnapshotChange,
  onContentChange,
}: ProfileHalfProps) {
  const snap = content.snapshot
  const fontHint = isJapanese ? "'Noto Sans JP', 'DM Sans', system-ui, sans-serif" : "'DM Sans', system-ui, sans-serif"

  return (
    <div style={{ padding: '24px 28px', fontFamily: fontHint }}>
      {/* Snapshot header */}
      <div
        style={{
          paddingBottom: '12px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Name | Title | Company row */}
        <div className="flex flex-wrap items-center gap-1" style={{ marginBottom: '4px' }}>
          <SnapshotField
            value={snap.name ?? ''}
            onChange={(v) => onSnapshotChange({ name: v })}
            placeholder="Full name"
            isJapanese={isJapanese}
            bold
          />
          {(snap.title || !isJapanese) && (
            <>
              <span style={{ color: 'var(--border)', fontSize: '13px' }}>|</span>
              <SnapshotField
                value={snap.title ?? ''}
                onChange={(v) => onSnapshotChange({ title: v })}
                placeholder="Title"
                isJapanese={isJapanese}
                bold
              />
            </>
          )}
          {(snap.company || !isJapanese) && (
            <>
              <span style={{ color: 'var(--border)', fontSize: '13px' }}>|</span>
              <SnapshotField
                value={snap.company ?? ''}
                onChange={(v) => onSnapshotChange({ company: v })}
                placeholder="Company"
                isJapanese={isJapanese}
                bold
              />
            </>
          )}
        </div>

        {/* Age | Current | Target row */}
        <div className="flex flex-wrap items-center gap-1">
          <SnapshotField
            value={snap.age ?? ''}
            onChange={(v) => onSnapshotChange({ age: v })}
            placeholder="Age"
            isJapanese={isJapanese}
          />
          {snap.currentComp !== undefined && (
            <>
              <span style={{ color: 'var(--border)', fontSize: '11px' }}>|</span>
              <SnapshotField
                value={snap.currentComp ?? ''}
                onChange={(v) => onSnapshotChange({ currentComp: v })}
                placeholder="Current comp"
                isJapanese={isJapanese}
              />
            </>
          )}
          {snap.targetComp !== undefined && (
            <>
              <span style={{ color: 'var(--border)', fontSize: '11px' }}>|</span>
              <SnapshotField
                value={snap.targetComp ?? ''}
                onChange={(v) => onSnapshotChange({ targetComp: v })}
                placeholder="Target comp"
                isJapanese={isJapanese}
              />
            </>
          )}
        </div>
      </div>

      {/* Sections */}
      <div style={{ marginBottom: '16px' }}>
        <SectionLabel text={isJapanese ? '職務経歴概要' : 'Executive Summary'} isJapanese={isJapanese} />
        <EditableText
          value={content.executiveSummary}
          onChange={(v) => onContentChange({ executiveSummary: v })}
          isJapanese={isJapanese}
          placeholder="Executive summary…"
          minRows={3}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <SectionLabel text={isJapanese ? '転職動機' : 'Career Motivation'} isJapanese={isJapanese} />
        <EditableText
          value={content.careerMotivation}
          onChange={(v) => onContentChange({ careerMotivation: v })}
          isJapanese={isJapanese}
          placeholder="Career motivation…"
          minRows={2}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <SectionLabel
          text={isJapanese ? `${clientCompany}とのマッチングポイント` : `Alignment with ${clientCompany}`}
          isJapanese={isJapanese}
        />
        <BulletsEditor
          bullets={content.alignment}
          onChange={(bullets) => onContentChange({ alignment: bullets })}
          isJapanese={isJapanese}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <SectionLabel text={isJapanese ? '報酬条件' : 'Compensation'} isJapanese={isJapanese} />
        <EditableText
          value={content.compensation}
          onChange={(v) => onContentChange({ compensation: v })}
          isJapanese={isJapanese}
          placeholder="Compensation details…"
          minRows={2}
        />
      </div>

      <div>
        <SectionLabel text={isJapanese ? 'リクルーター評価' : 'Recruiter Assessment'} isJapanese={isJapanese} />
        <EditableText
          value={content.closing}
          onChange={(v) => onContentChange({ closing: v })}
          isJapanese={isJapanese}
          placeholder="Recruiter assessment…"
          minRows={3}
        />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ProfilePreview({ state, clientCompany, onChange }: Props) {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* English half */}
      <ProfileHalf
        content={state.english}
        clientCompany={clientCompany}
        onSnapshotChange={(patch) => onChange(updateEnglishSnapshot(state, patch))}
        onContentChange={(patch) => onChange(updateEnglish(state, patch))}
      />

      {/* Dividing line */}
      <div
        style={{
          height: '1px',
          backgroundColor: 'var(--foreground)',
          margin: '0 28px',
          opacity: 0.7,
        }}
      />

      {/* Japanese half */}
      <ProfileHalf
        content={state.japanese}
        clientCompany={clientCompany}
        isJapanese
        onSnapshotChange={(patch) => onChange(updateJapaneseSnapshot(state, patch))}
        onContentChange={(patch) => onChange(updateJapanese(state, patch))}
      />
    </div>
  )
}
