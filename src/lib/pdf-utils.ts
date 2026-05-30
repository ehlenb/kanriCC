import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import type { ProfileContent } from '../integrations/supabase/types'

// ── HTML generation ───────────────────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escNl(str: string | null | undefined): string {
  return esc(str).replace(/\n/g, '<br>')
}

function renderHalf(content: ProfileContent, clientCompany: string, isJapanese: boolean): string {
  const fontFamily = isJapanese
    ? `'Noto Sans JP', 'DM Sans', 'Hiragino Sans', 'Yu Gothic', sans-serif`
    : `'DM Sans', system-ui, sans-serif`

  const snap = content.snapshot
  const snapParts = [snap.name, snap.title, snap.company].filter(Boolean).map(esc)
  const compParts: string[] = []
  if (snap.age) compParts.push(`Age: ${esc(snap.age)}`)
  if (snap.currentComp) compParts.push(`Current: ${esc(snap.currentComp)}`)
  if (snap.targetComp) compParts.push(`Target: ${esc(snap.targetComp)}`)

  const bullets = content.alignment
    .map((b) => `<div style="padding:2px 0;display:flex;gap:6px"><span style="flex-shrink:0">&#8226;</span><span>${escNl(b)}</span></div>`)
    .join('')

  const sectionLabel = (text: string) =>
    `<div style="font-size:8px;letter-spacing:0.2em;color:#9a9080;font-weight:500;text-transform:uppercase;margin-bottom:5px;font-family:${fontFamily}">${text}</div>`

  const section = (label: string, body: string) =>
    `<div style="margin-bottom:18px">${sectionLabel(label)}<div style="font-size:11px;line-height:1.7;color:#1a1814;font-family:${fontFamily}">${body}</div></div>`

  return `
    <div style="padding:28px 32px;font-family:${fontFamily}">
      <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #d9d3c7">
        <div style="font-size:13px;font-weight:500;color:#1a1814;margin-bottom:4px;line-height:1.4;font-family:${fontFamily}">
          ${snapParts.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}
        </div>
        ${compParts.length ? `<div style="font-size:11px;color:#7a7060;font-family:${fontFamily}">${compParts.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>` : ''}
      </div>

      ${section(isJapanese ? '職務経歴概要' : 'Executive Summary', escNl(content.executiveSummary))}
      ${section(isJapanese ? '転職動機' : 'Career Motivation', escNl(content.careerMotivation))}

      <div style="margin-bottom:18px">
        ${sectionLabel(isJapanese ? `${clientCompany}とのマッチングポイント` : `ALIGNMENT WITH ${clientCompany}`)}
        <div style="font-size:11px;line-height:1.7;color:#1a1814;font-family:${fontFamily}">${bullets}</div>
      </div>

      ${section(isJapanese ? '報酬条件' : 'Compensation', escNl(content.compensation))}

      <div style="margin-bottom:18px">
        ${sectionLabel(isJapanese ? 'リクルーター評価' : 'Recruiter Assessment')}
        <div style="font-size:11px;line-height:1.7;color:#1a1814;font-family:${fontFamily}">
          ${escNl(content.closing)}
        </div>
      </div>
    </div>
  `
}

export function generateProfileHtml(
  english: ProfileContent,
  japanese: ProfileContent,
  clientCompany: string,
): string {
  return `
    <div style="width:720px;background:#ffffff;font-size:13px">
      ${renderHalf(english, clientCompany, false)}
      <div style="height:1px;background:#1a1814;margin:0 32px"></div>
      ${renderHalf(japanese, clientCompany, true)}
    </div>
  `
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function renderToPdf(html: string): Promise<Blob> {
  // Create off-screen container
  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;top:-10000px;left:0;width:720px;background:#ffffff;pointer-events:none;z-index:-1'
  container.innerHTML = html
  document.body.appendChild(container)

  // Wait for fonts to load
  await document.fonts.ready

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  document.body.removeChild(container)

  const imgData = canvas.toDataURL('image/jpeg', 0.92)

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8

  const availW = pageW - margin * 2
  const availH = pageH - margin * 2
  const imgAspect = canvas.width / canvas.height

  let drawW = availW
  let drawH = drawW / imgAspect
  if (drawH > availH) {
    drawH = availH
    drawW = drawH * imgAspect
  }

  const x = margin + (availW - drawW) / 2
  const y = margin + (availH - drawH) / 2

  pdf.addImage(imgData, 'JPEG', x, y, drawW, drawH)

  return pdf.output('blob')
}

// ── Public download functions ─────────────────────────────────────────────────

interface ProfileDownloadSpec {
  candidateName: string
  english: ProfileContent
  japanese: ProfileContent
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9　-鿿゠-ヿ぀-ゟ _-]/g, '_').trim()
}

export async function downloadSingleProfile(
  spec: ProfileDownloadSpec,
  clientCompany: string,
): Promise<void> {
  const html = generateProfileHtml(spec.english, spec.japanese, clientCompany)
  const blob = await renderToPdf(html)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(spec.english.snapshot.name ?? spec.candidateName)}_Profile.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadAllProfilesZip(
  specs: ProfileDownloadSpec[],
  clientCompany: string,
): Promise<void> {
  if (specs.length === 1) {
    return downloadSingleProfile(specs[0]!, clientCompany)
  }

  const zip = new JSZip()

  for (const spec of specs) {
    const html = generateProfileHtml(spec.english, spec.japanese, clientCompany)
    const blob = await renderToPdf(html)
    const filename = `${safeFilename(spec.english.snapshot.name ?? spec.candidateName)}_Profile.pdf`
    zip.file(filename, blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Candidate_Profiles.zip'
  a.click()
  URL.revokeObjectURL(url)
}
