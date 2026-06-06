import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconFileText } from "@tabler/icons-react";
import type { SubmissionPackage, ProfileContent } from "@/integrations/supabase/types";

export function SubmissionPackagePanel({
  pkg,
  candidateName,
  onClose,
}: {
  pkg: SubmissionPackage;
  candidateName: string;
  onClose: () => void;
}) {
  const [emailBody, setEmailBody] = useState(pkg.email.body);
  const [emailSubject, setEmailSubject] = useState(pkg.email.subject);
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const { downloadSingleProfile } = await import("@/lib/pdf-utils");
      await downloadSingleProfile(
        { candidateName, english: pkg.englishContent, japanese: pkg.japaneseContent },
        "",
      );
    } catch { toast.error("PDF generation failed. Try again."); }
    finally { setDownloading(false); }
  }

  function ProfileSection({ label, content }: { label: string; content: ProfileContent }) {
    return (
      <div className=" p-4" style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}>
        <p className="sl mb-3">{label}</p>
        <div className="space-y-3 text-[13px]">
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Executive summary</p>
            <p className="leading-relaxed" style={{ color: "#1a1a18" }}>{content.executiveSummary}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Career motivation</p>
            <p className="leading-relaxed" style={{ color: "#1a1a18" }}>{content.careerMotivation}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Alignment points</p>
            <ul className="space-y-1" style={{ color: "#1a1a18" }}>
              {content.alignment.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ color: "#888780" }}>·</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Compensation</p>
            <p style={{ color: "#1a1a18" }}>{content.compensation}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Closing</p>
            <p style={{ color: "#1a1a18" }}>{content.closing}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-4  p-5 space-y-5"
      style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium">Submission package — review before sending</p>
        <div className="flex gap-2">
          <button className="ab" onClick={() => void downloadPdf()} disabled={downloading}>
            <IconFileText size={11} />
            {downloading ? "Generating PDF…" : "Download PDF"}
          </button>
          <button className="text-[11px]" style={{ color: "#888780" }} onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>

      <div>
        <p className="sl mb-2">A — Submission email</p>
        <div className="space-y-2">
          <div>
            <Label className="text-xs mb-1 block">Subject</Label>
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="text-xs" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Email body</Label>
              <button
                className="text-[11px] underline underline-offset-2"
                style={{ color: "#185fa5" }}
                onClick={() => { void navigator.clipboard.writeText(emailBody); toast.success("Email copied."); }}
              >
                Copy
              </button>
            </div>
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="min-h-[160px] text-[12px]"
            />
          </div>
        </div>
      </div>

      <ProfileSection label="B — English profile" content={pkg.englishContent} />
      <ProfileSection label="C — Japanese profile" content={pkg.japaneseContent} />
    </div>
  );
}
