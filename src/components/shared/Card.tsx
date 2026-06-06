import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border  p-4 px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
