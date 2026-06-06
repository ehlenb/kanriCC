import { cn } from "@/lib/utils";

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  highlight?: "warning" | "danger" | "success";
}

export function FieldRow({ label, children, className, highlight }: FieldRowProps) {
  const highlightClass =
    highlight === "warning"
      ? "bg-[--color-gold-light] px-1 -mx-1"
      : highlight === "danger"
        ? "bg-[--color-vermillion-light] px-1 -mx-1"
        : highlight === "success"
          ? "bg-[--color-moss-light] px-1 -mx-1"
          : "";

  return (
    <div
      className={cn(
        "flex justify-between items-start text-[13px] py-1.5 border-b border-[--color-ink-15] last:border-0 gap-3",
        highlightClass,
        className,
      )}
    >
      <span className="text-[--color-ink-60] shrink-0 min-w-[130px]">{label}</span>
      <span className="text-right leading-relaxed">{children}</span>
    </div>
  );
}
