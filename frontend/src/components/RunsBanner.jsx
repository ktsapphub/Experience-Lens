import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Gauge, Send, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

// Run countdown for non-admins. On the last run (and when out) it offers "Request 5 more runs".
export default function RunsBanner() {
  const { user, setRuns } = useAuth();
  const [sending, setSending] = useState(false);
  const runs = user?.runs;
  if (!runs || runs.unlimited) return null;

  const { runs_left: left, runs_limit: limit, pending_request: pending } = runs;
  const low = left <= 1;
  const out = left === 0;

  const request = async () => {
    setSending(true);
    try {
      const res = await axios.post(`${API}/runs/request`);
      setRuns(res.data.runs);
      toast.success("Request sent. You'll get 5 more runs once the admin approves.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't send the request");
    } finally {
      setSending(false);
    }
  };

  const tone = out
    ? "border-destructive/30 bg-destructive/5"
    : low
      ? "border-amber-300 bg-amber-50"
      : "border-border bg-secondary/40";

  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${tone}`} data-testid="runs-banner">
      <div className="flex items-center gap-3">
        <Gauge className="w-5 h-5 text-primary" />
        <div>
          <p className="text-sm font-semibold" data-testid="runs-left">
            {out ? "You're out of runs" : `${left} of ${limit} runs left`}
          </p>
          <p className="text-xs text-muted-foreground">
            {out
              ? "Ask the admin for 5 more to keep searching."
              : low
                ? "This is your last run. Request more now so you're not stuck."
                : "Each location search that finds results uses one run."}
          </p>
        </div>
      </div>
      {low && (pending ? (
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground" data-testid="runs-pending">
          <Clock className="w-4 h-4" /> Request sent, waiting for the admin
        </span>
      ) : (
        <Button size="sm" onClick={request} disabled={sending} data-testid="request-runs-button">
          <Send className="w-4 h-4 mr-2" />
          Request 5 more runs
        </Button>
      ))}
    </div>
  );
}
