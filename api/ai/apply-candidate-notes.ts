import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `You are helping a recruiter organise raw interview and call notes into a structured candidate profile template.

The template is an HTML document with clearly labelled sections (h1, h2, h3 headings and paragraph text).

Your job:
- Read the notes or document provided by the recruiter
- Identify which information belongs in which section of the existing template
- Enrich the existing template content with the new information — do NOT delete or overwrite existing content unless the new notes directly contradict it (e.g. an updated salary figure)
- Place each piece of information into the most appropriate section
- Keep the exact same HTML structure — same headings, same order. Only modify the text inside <p>, <ul>, <li> tags
- If a section gets new content, append or integrate it naturally
- For empty <p></p> tags, replace with the relevant content
- Return ONLY the complete updated HTML document, nothing else — no explanation, no markdown code fences`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { candidateId, existingTemplate, rawNotes, fileBase64, fileType } = req.body as {
    candidateId: string;
    existingTemplate: string;
    rawNotes?: string;
    fileBase64?: string;
    fileType?: "pdf" | "docx" | "text";
  };

  if (!candidateId || !existingTemplate || (!rawNotes && !fileBase64)) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const templatePrompt = `Here is the existing candidate note template (HTML):\n\n${existingTemplate}\n\n---\n\n`;
  const applyInstruction = `\n\nReturn the updated HTML template with the information intelligently applied to the relevant sections.`;

  let message: Awaited<ReturnType<typeof anthropic.messages.create>>;

  if (fileType === "pdf" && fileBase64) {
    // PDF — send as native document block; Claude reads it directly
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: fileBase64,
              },
            } as Parameters<typeof anthropic.messages.create>[0]["messages"][0]["content"][0],
            {
              type: "text",
              text: `${templatePrompt}The recruiter has uploaded the above PDF document containing their notes.${applyInstruction}`,
            },
          ],
        },
      ],
    });
  } else if (fileType === "docx" && fileBase64) {
    // Word — extract plain text with mammoth, then pass as text to Claude
    const buffer = Buffer.from(fileBase64, "base64");
    const extracted = await mammoth.extractRawText({ buffer });
    const docText = extracted.value.trim();

    if (!docText) {
      return res.status(400).json({ error: "Could not extract text from the Word document." });
    }

    message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${templatePrompt}Here are the recruiter's notes from the uploaded Word document:\n\n${docText}${applyInstruction}`,
        },
      ],
    });
  } else {
    // Plain text / paste
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${templatePrompt}Here are the recruiter's raw notes to apply:\n\n${rawNotes}${applyInstruction}`,
        },
      ],
    });
  }

  const updatedHtml = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  if (!updatedHtml) {
    return res.status(500).json({ error: "AI returned empty response" });
  }

  const { error: dbErr } = await supabase
    .from("candidates")
    .update({ notes_template: updatedHtml })
    .eq("id", candidateId);

  if (dbErr) {
    return res.status(500).json({ error: "Failed to save updated template" });
  }

  return res.status(200).json({ notes_template: updatedHtml });
}
