import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, X, Plus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "");

// Admin: approve run requests and see everyone's allowance.
export default function AdminPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [topUp, setTopUp] = useState(5);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u] = await Promise.all([axios.get(`${API}/admin/run-requests`), axios.get(`${API}/users`)]);
      setRequests(r.data.requests);
      setTopUp(r.data.top_up);
      setUsers(u.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  if (user && user.role !== "admin") return <Navigate to="/search" replace />;

  const act = async (key, path, success) => {
    setBusy(key);
    try {
      await axios.post(`${API}${path}`);
      toast.success(success);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Action failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="admin-refresh">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </Header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Run requests <Badge variant="secondary">{requests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="run-requests">
                {requests.map((r) => (
                  <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{r.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Used {r.runs_used} of {r.runs_limit} · requested {fmt(r.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy === r.id}
                        onClick={() => act(r.id, `/admin/run-requests/${r.id}/approve`, `Gave ${r.email} ${topUp} more runs`)}
                        data-testid="approve-request"
                      >
                        <Check className="w-4 h-4 mr-1" /> Approve +{topUp}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.id}
                        onClick={() => act(r.id, `/admin/run-requests/${r.id}/deny`, "Request denied")}
                        data-testid="deny-request"
                      >
                        <X className="w-4 h-4 mr-1" /> Deny
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Users <Badge variant="secondary">{users.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="users-table">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Runs left</th>
                  <th className="py-2 pr-4 font-medium">Joined</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const admin = u.role === "admin";
                  const left = Math.max(0, (u.runs_limit ?? 0) - (u.runs_used ?? 0));
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4">{u.email} {admin && <Badge className="ml-1">admin</Badge>}</td>
                      <td className="py-2 pr-4">{admin ? "Unlimited" : `${left} of ${u.runs_limit}`}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{fmt(u.created_at)}</td>
                      <td className="py-2 text-right">
                        {!admin && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === u.id}
                            onClick={() => act(u.id, `/admin/users/${u.id}/grant-runs`, `Gave ${u.email} ${topUp} more runs`)}
                          >
                            <Plus className="w-4 h-4 mr-1" /> {topUp} runs
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
