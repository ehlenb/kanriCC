import { cn } from "@/lib/utils";
import { stageBadgeVariant } from "@/lib/candidate-utils";

interface StageBadgeProps {
  stage: string;
  className?: string;
}

const variantStyles = {
  info: "bg-info-bg text-info border-info-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  gold: "bg-gold-bg text-gold border-gold-border",
  success: "bg-success-bg text-success border-success-border",
  gray: "bg-surface text-muted-foreground border-border",
};

export function StageBadge({ stage, className }: StageBadgeProps) {
  const variant = stageBadgeVariant(stage);
  return (
    <span
      className={cn(
        "inline-block text-[11px] font-medium px-2 py-0.5 rounded border whitespace-nowrap",
        variantStyles[variant],
        className,
      )}
    >
      {stage}
    </span>
  );
}
