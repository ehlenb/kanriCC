import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/shared/Card";
import { SectionLabel } from "@/components/shared/SectionLabel";

/**
 * Shared job-description viewer + uploader, used on both the standalone
 * /jobs/$id page and the client's Jobs tab (JobDetailPanel) so they can
 * never drift out of sync again.
 *
 * PDFs render in a real embedded preview (iframe). Word docs are converted
 * to formatted HTML (via mammoth) for an equivalent scrollable preview,
 * since browsers can't render .docx natively. Double-clicking the preview
 * opens the original file in a new tab. The "resumes" storage bucket
 * accepts both PDF and .docx (migration 043) so the original file is
 * always kept, not just its extracted text.
 */
export function JdViewer({
  requisitionId,
  recruiterId,
  jdUrl,
  jdText,
  onUploaded,
}: {
  requisitionId: string;
  recruiterId: string;
  jdUrl: string | null;
  jdText: string | null;
  onUploaded?: (fields: { jd_url: string; jd_text: string }) => void;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const isDocx = !!jdUrl && jdUrl.toLowerCase().endsWith(".docx");
  const isPdf = !!jdUrl && jdUrl.toLowerCase().endsWith(".pdf");

  const signedUrl = useQuery({
    queryKey: ["jd-signed-url", jdUrl],
    staleTime: 30_000,
    retry: 1,
    enabled: !!jdUrl,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("resumes").createSignedUrl(jdUrl!, 3600);
      if (error) return null;
      return data.signedUrl;
    },
  });

  const docxHtml = useQuery({
    queryKey: ["jd-docx-html", jdUrl],
    staleTime: 30_000,
    retry: 1,
    enabled: isDocx && !!signedUrl.data,
    queryFn: async () => {
      const resp = await fetch(signedUrl.data!);
      const buf = await resp.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      return result.value;
    },
  });

  async function handleJdFile(file: File) {
    setUploading(true);
    try {
      let extractedText = "";
      const isPdfFile = file.type === "application/pdf" || file.name.endsWith(".pdf");
      const isDocxFile = file.name.endsWith(".docx");

      if (isDocxFile) {
        const mammoth = await import("mammoth");
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        extractedText = result.value;
      } else if (isPdfFile) {
        const buf = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const resp = await fetch("/api/extract-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: base64 }),
        });
        const data = (await resp.json()) as { text?: string };
        extractedText = data.text?.trim() ?? "";
      }

      if (!isPdfFile && !isDocxFile) {
        toast.error("Only PDF and Word (.docx) files are supported.");
        return;
      }

      const path = `${recruiterId}/${requisitionId}/jd_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("resumes").upload(path, file);
      if (uploadError) { toast.error("Upload failed. Try again."); return; }

      const { error: updateError } = await supabase
        .from("requisitions")
        .update({ jd_url: path, jd_text: extractedText || null })
        .eq("id", requisitionId);
      if (updateError) { toast.error("Could not save the job description. Try again."); return; }

      toast.success("JD uploaded.");
      onUploaded?.({ jd_url: path, jd_text: extractedText });
      void qc.invalidateQueries({ queryKey: ["requisition", requisitionId] });
      void qc.invalidateQueries({ queryKey: ["jd-signed-url"] });
    } catch {
      toast.error("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function openOriginal() {
    if (signedUrl.data) window.open(signedUrl.data, "_blank", "noopener,noreferrer");
  }

  if (!jdUrl && !jdText) {
    return (
      <Card>
        <SectionLabel className="mb-2">Job description</SectionLabel>
        <div
          className="p-4 text-center cursor-pointer"
          style={{ border: "1px dashed var(--color-ink-15)" }}
          onClick={() => fileInputRef.current?.click()}
        >
          <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
            {uploading ? "Uploading…" : "No job description uploaded — click to upload a PDF or Word doc."}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleJdFile(f); e.target.value = ""; }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Job description</SectionLabel>
        <button
          className="text-[11px]"
          style={{ color: "var(--color-ink-30)" }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "Replace"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleJdFile(f); e.target.value = ""; }}
        />
      </div>

      {isPdf && signedUrl.data ? (
        <iframe
          src={signedUrl.data}
          title="Job description"
          onDoubleClick={openOriginal}
          className="w-full"
          style={{ height: 480, border: "0.5px solid var(--color-ink-15)" }}
        />
      ) : isDocx && docxHtml.data ? (
        <div
          onDoubleClick={openOriginal}
          className="jd-docx-preview overflow-auto cursor-zoom-in"
          style={{ height: 480, border: "0.5px solid var(--color-ink-15)", padding: "16px 20px", background: "#fff" }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: docxHtml.data }}
        />
      ) : jdText ? (
        <pre
          className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans overflow-auto"
          style={{ color: "var(--color-ink)", maxHeight: 420 }}
        >
          {jdText}
        </pre>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
          {signedUrl.isLoading || docxHtml.isLoading ? "Loading JD…" : "JD not available."}
        </p>
      )}
      {(isPdf || isDocx) && signedUrl.data && (
        <p className="text-[10px] mt-1.5" style={{ color: "var(--color-ink-30)" }}>
          Double-click to open the original file.
        </p>
      )}
    </Card>
  );
}
