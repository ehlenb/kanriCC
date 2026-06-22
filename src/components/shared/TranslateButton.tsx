import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Props = {
  text: string;
  onTranslated: (translated: string) => void;
  className?: string;
};

export function TranslateButton({ text, onTranslated, className }: Props) {
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const targetLang = i18n.language === "ja" ? "ja" : "en";
  const label = i18n.language === "ja" ? "翻訳" : "Translate";
  const doneLabel = i18n.language === "ja" ? "翻訳済み" : "Translated";

  async function handleTranslate() {
    if (!text?.trim() || done) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target_lang: targetLang }),
      });
      const data = await res.json() as { translated?: string; error?: string };
      if (data.translated) {
        onTranslated(data.translated);
        setDone(true);
      } else {
        toast.error("Could not translate. Try again.");
      }
    } catch {
      toast.error("Could not translate. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={() => void handleTranslate()}
      disabled={loading || done || !text?.trim()}
      className={className}
      style={{
        fontSize: 11,
        fontFamily: "var(--font-mono, monospace)",
        letterSpacing: "0.04em",
        color: done ? "var(--color-moss)" : "var(--color-indigo)",
        opacity: loading || !text?.trim() ? 0.5 : 1,
        background: "none",
        border: "none",
        cursor: loading || done ? "default" : "pointer",
        padding: 0,
      }}
    >
      {loading ? "…" : done ? doneLabel : label}
    </button>
  );
}
