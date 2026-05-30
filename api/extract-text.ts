import type { VercelRequest, VercelResponse } from "@vercel/node";
import pdfParse from "pdf-parse";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { pdf_base64 } = req.body as { pdf_base64?: string };
  if (!pdf_base64) return res.status(400).json({ error: "pdf_base64 is required" });

  try {
    const buf = Buffer.from(pdf_base64, "base64");
    const result = await pdfParse(buf);
    return res.status(200).json({ text: result.text });
  } catch {
    return res.status(200).json({ error: "Could not extract text from PDF." });
  }
}
