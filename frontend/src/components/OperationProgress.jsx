import { useEffect, useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

/**
 * Lightweight progress + ETA bar for batched async ops (shorten / generate).
 * Backend processes the batch in parallel, so we approximate progress using
 * the configured per-item cost. Caps at 95% while still running so the user
 * sees the bar "complete" only when `active` flips to false.
 */
export default function OperationProgress({ active, total, estPerItemMs, label = "Working" }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setElapsedMs(0);
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsedMs(Date.now() - (startRef.current || Date.now()));
    }, 200);
    return () => clearInterval(id);
  }, [active]);

  if (!active || !total) return null;

  // Parallel batch — total time ≈ estPerItemMs * sqrt(total) but cap to a sane window.
  const estTotalMs = Math.max(1500, Math.min(estPerItemMs * Math.ceil(total / 3), estPerItemMs * total));
  const rawPct = (elapsedMs / estTotalMs) * 100;
  const pct = Math.min(95, Math.max(3, rawPct));
  const remainingMs = Math.max(0, estTotalMs - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="flex flex-col gap-1 mt-1.5" data-testid="op-progress">
      <Progress value={pct} className="h-1.5" />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {label} {total} item{total === 1 ? "" : "s"}
        </span>
        <span data-testid="op-progress-eta">~{remainingSec}s remaining</span>
      </div>
    </div>
  );
}
