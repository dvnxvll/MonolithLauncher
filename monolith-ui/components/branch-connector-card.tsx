import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BranchPosition = "single" | "first" | "middle" | "last";

interface BranchConnectorCardProps {
  position: BranchPosition;
  className?: string;
  children: ReactNode;
}

export function BranchConnectorCard({
  position,
  className,
  children,
}: BranchConnectorCardProps) {
  const isFirst = position === "first";
  const isMiddle = position === "middle";
  const isLast = position === "last";
  const hasVertical = position !== "single";
  const connectorColor = "border-emerald-300/55";
  const railColor = "bg-emerald-300/40";
  const connectorOffset = "-left-[18px]";
  const segmentGap = "0.75rem";

  return (
    <div className={cn("relative rounded-xl border border-border p-4", className)}>
      {isLast ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 h-[7px] w-[18px] -translate-y-[7px] rounded-bl-[7px] border-l border-b",
            connectorOffset,
            connectorColor,
          )}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 h-px w-[18px] -translate-y-1/2",
            connectorOffset,
            railColor,
          )}
        />
      )}
      {hasVertical && (isFirst || isMiddle) ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute w-px",
            connectorOffset,
            railColor,
            isFirst ? "-top-4 -bottom-3" : "-top-3 -bottom-3",
          )}
        />
      ) : null}
      {hasVertical && isLast ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute w-px -top-3 h-[calc(50%+0.75rem)]",
            connectorOffset,
            railColor,
          )}
          style={{ height: `calc(50% + ${segmentGap})` }}
        />
      ) : null}
      {children}
    </div>
  );
}
