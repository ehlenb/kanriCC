import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CLOSED_REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "client_rejected", label: "Client passed on the candidate" },
  { value: "candidate_withdrew", label: "Candidate withdrew" },
  { value: "counteroffer", label: "Candidate accepted a counteroffer" },
  { value: "competing_offer", label: "Candidate accepted a different offer" },
  { value: "salary_mismatch", label: "Compensation gap could not be bridged" },
  { value: "client_cancelled_role", label: "Client closed, paused, or cancelled the role" },
  { value: "no_response", label: "Went cold / unresponsive" },
  { value: "other", label: "Other" },
];

export type ProcessOutcome = {
  closed_reason_category?: string;
  closed_reason?: string;
  placed_fee_jpy?: number;
  start_date?: string;
};

type Props = {
  open: boolean;
  targetStage: "Placed" | "Closed lost";
  candidateName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (outcome: ProcessOutcome) => void;
};

export function ProcessOutcomeModal({
  open,
  targetStage,
  candidateName,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const [feeYenM, setFeeYenM] = useState("");
  const [feeUnknown, setFeeUnknown] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [category, setCategory] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");

  function reset() {
    setFeeYenM("");
    setFeeUnknown(false);
    setStartDate("");
    setCategory("");
    setReasonDetail("");
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  const isPlaced = targetStage === "Placed";
  const feeValid = feeUnknown || feeYenM.trim() !== "";
  const reasonValid = category !== "" && (category !== "other" || reasonDetail.trim() !== "");
  const canSubmit = isPlaced ? feeValid : reasonValid;

  function handleSubmit() {
    if (!canSubmit) return;
    const outcome: ProcessOutcome = isPlaced
      ? {
          placed_fee_jpy: feeUnknown || !feeYenM.trim() ? undefined : Math.round(parseFloat(feeYenM) * 1_000_000),
          start_date: startDate.trim() || undefined,
        }
      : {
          closed_reason_category: category,
          closed_reason: reasonDetail.trim() || undefined,
        };
    reset();
    onConfirm(outcome);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            {isPlaced ? `Mark ${candidateName} as Placed` : `Close process — ${candidateName}`}
          </DialogTitle>
        </DialogHeader>

        {isPlaced ? (
          <div className="space-y-3 py-2">
            <div>
              <Label className="label block mb-1">Placement fee (¥M)</Label>
              <Input
                type="number"
                step="0.1"
                value={feeYenM}
                disabled={feeUnknown}
                onChange={(e) => setFeeYenM(e.target.value)}
                placeholder="e.g. 3.5"
                className="text-[13px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="fee-unknown"
                checked={feeUnknown}
                onChange={(e) => {
                  setFeeUnknown(e.target.checked);
                  if (e.target.checked) setFeeYenM("");
                }}
              />
              <label htmlFor="fee-unknown" className="text-[13px]" style={{ color: "var(--color-ink-60)" }}>
                Fee not finalized yet
              </label>
            </div>
            <div>
              <Label className="label block mb-1">Start date (optional)</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-[13px]"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label className="label block mb-1">Reason</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="text-[13px] w-full px-2 py-1.5 outline-none"
                style={{ border: "0.5px solid var(--color-ink-15)", color: "var(--color-ink)", background: "var(--color-white)" }}
              >
                <option value="" disabled>Select a reason…</option>
                {CLOSED_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="label block mb-1">
                Detail {category === "other" ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                rows={3}
                className="text-[13px] font-sans resize-none"
                placeholder="Add context for this outcome…"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={submitting} className="btn btn-ghost btn-sm">
            Cancel
          </Button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Saving…" : isPlaced ? "Confirm placement" : "Close process"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
