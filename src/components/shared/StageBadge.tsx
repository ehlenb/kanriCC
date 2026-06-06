import { cn } from "@/lib/utils";
import { stageBadgeVariant } from "@/lib/candidate-utils";

interface StageBadgeProps {
  stage: string;
  className?: string;
}

const variantStyles = {
  info:    "bg-[--color-indigo-light] text-[--color-indigo] border-[--color-indigo-light]",
  warning: "bg-[--color-gold-light] text-[--color-gold] border-[--color-gold-light]",
  gold:    "bg-[--color-gold-light] text-[--color-gold] border-[--color-gold-light]",
  success: "bg-[--color-moss-light] text-[--color-moss] border-[--color-moss-light]",
  gray:    "bg-[--color-ink-10] text-[--color-ink-60] border-[--color-ink-15]",
};

export function StageBadge({ stage, className }: StageBadgeProps) {
  const variant = stageBadgeVariant(stage);
  return (
    <span
      className={cn(
        "inline-block font-mono text-[10px] font-normal tracking-[0.08em] uppercase px-2 py-0.5 border whitespace-nowrap",
        variantStyles[variant],
        className,
      )}
    >
      {stage}
    </span>
  );
}
