// 職務経歴書 builder, export step (Wave 6, piece 4). Pure formatting -- no
// Claude call, no model in this file at all. Takes the (possibly
// recruiter-edited) structured draft from lib/ai-handlers/shokumu-keirekisho.ts
// and builds a .docx buffer. Kept as its own file, separate from the AI
// generation step, so "AI drafts, recruiter edits, system exports" stays a
// clean three-step flow and editability is never bypassed by a one-click
// export straight from the model's own output.
//
// New lib/ subdirectory, paralleling import-handlers/oauth-handlers/
// addin-handlers -- non-AI request logic that still belongs under lib/, not
// api/, per the "thin api/, logic in lib/" convention every other handler
// already follows.

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Role = { period: string; company: string; title: string; achievements: string };
type Draft = {
  candidate_name: string;
  career_summary: string;
  roles: Role[];
  skills: string;
  self_pr: string;
};

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true })],
  });
}

function body(text: string) {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun(line.trim())] }));
}

function buildDocument(draft: Draft): Document {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun(dateStr)],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: "職務経歴書", bold: true, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun(`氏名：${draft.candidate_name}`)],
    }),
    heading("■ 職務要約"),
    ...body(draft.career_summary || "—"),
    heading("■ 職務経歴"),
  ];

  for (const role of draft.roles) {
    children.push(
      new Paragraph({
        spacing: { before: 150, after: 50 },
        children: [new TextRun({ text: `${role.period}　${role.company}`, bold: true })],
      }),
      new Paragraph({
        spacing: { after: 50 },
        children: [new TextRun(role.title || "")],
      }),
      ...body(role.achievements || "—"),
    );
  }

  children.push(
    heading("■ 活かせる経験・知識・技術"),
    ...body(draft.skills || "—"),
    heading("■ 自己PR"),
    ...body(draft.self_pr || "—"),
  );

  return new Document({ sections: [{ children }] });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { candidate_name, career_summary, roles, skills, self_pr } = req.body as Draft;
  if (!candidate_name || !Array.isArray(roles)) {
    return res.status(400).json({ error: "candidate_name and roles are required" });
  }

  try {
    const doc = buildDocument({ candidate_name, career_summary, roles, skills, self_pr });
    const buffer = await Packer.toBuffer(doc);
    return res.status(200).json({ file_base64: buffer.toString("base64"), filename: `${candidate_name}_職務経歴書.docx` });
  } catch (err) {
    console.error("[shokumu-keirekisho-docx]", err instanceof Error ? err.message : err);
    return res.status(200).json({ error: "Could not export the document. Try again." });
  }
}
