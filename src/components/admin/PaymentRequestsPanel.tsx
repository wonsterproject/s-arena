import { useEffect, useState } from "react";
import { Loader2, Check, X, Eye, Save, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface PaymentRequest {
  id: string;
  user_id: string;
  kind: "buy" | "withdraw";
  coins: number;
  pkr_amount: number;
  screenshot_url: string | null;
  easypaisa_number: string | null;
  easypaisa_name: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  profile?: { username: string; display_name: string | null } | null;
}

export default function PaymentRequestsPanel() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState({ easypaisa_number: "", easypaisa_name: "" });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { void load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    let query = supabase.from("payment_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter === "pending") query = query.eq("status", "pending");

    const [{ data: reqs }, { data: settingsRow }] = await Promise.all([
      query,
      supabase.from("payment_settings").select("easypaisa_number, easypaisa_name").maybeSingle(),
    ]);

    // Fetch profiles separately
    const userIds = Array.from(new Set((reqs ?? []).map((r: any) => r.user_id)));
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id, username, display_name").in("id", userIds)
      : { data: [] as any[] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

    const list = (reqs ?? []).map((r: any) => ({
      ...r,
      profile: profMap.get(r.user_id) ?? null,
    }));
    setRequests(list as PaymentRequest[]);
    if (settingsRow) setSettings(settingsRow as any);
    setLoading(false);
  };

  const resolve = async (req: PaymentRequest, approve: boolean) => {
    setActing(req.id);
    const note = approve ? null : window.prompt("Reason for rejection (optional)") ?? "";
    const { error } = await supabase.rpc("admin_resolve_payment_request", {
      _request_id: req.id,
      _approve: approve,
      _note: note ?? null,
    });
    setActing(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: approve ? "Approved" : "Rejected",
      description: `${req.kind === "buy" ? "Coins credited to" : "Coins refunded to"} @${req.profile?.username ?? "user"}`,
    });
    void load();
  };

  const viewScreenshot = async (path: string) => {
    const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (data?.signedUrl) setPreviewUrl(data.signedUrl);
    else toast({ title: "Could not load image", variant: "destructive" });
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.rpc("update_payment_settings", {
      _number: settings.easypaisa_number,
      _name: settings.easypaisa_name,
    });
    setSavingSettings(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Settings updated" });
  };

  return (
    <div className="space-y-4">
      {/* EasyPaisa settings */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="font-bold">EasyPaisa Account (shown to users on Buy screen)</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Number</Label>
            <Input
              value={settings.easypaisa_number}
              onChange={(e) => setSettings((s) => ({ ...s, easypaisa_number: e.target.value }))}
              className="bg-secondary/50 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Account holder name</Label>
            <Input
              value={settings.easypaisa_name}
              onChange={(e) => setSettings((s) => ({ ...s, easypaisa_name: e.target.value }))}
              className="bg-secondary/50 mt-1"
            />
          </div>
        </div>
        <button
          onClick={saveSettings}
          disabled={savingSettings}
          className="glass-btn h-9 mt-3 px-3 text-xs flex items-center gap-1 bg-gradient-to-r from-primary/30 to-accent/30"
        >
          {savingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter("pending")}
          className={`glass-btn h-8 px-3 text-xs ${filter === "pending" ? "bg-primary/30" : ""}`}
        >Pending</button>
        <button
          onClick={() => setFilter("all")}
          className={`glass-btn h-8 px-3 text-xs ${filter === "all" ? "bg-primary/30" : ""}`}
        >All recent</button>
        <span className="text-xs text-muted-foreground ml-auto">{requests.length} requests</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : requests.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No requests</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="glass rounded-xl p-3 border border-border/40">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded ${
                      r.kind === "buy" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"
                    }`}>{r.kind}</span>
                    <span className={`text-[10px] uppercase font-bold ${
                      r.status === "pending" ? "text-yellow-400" :
                      r.status === "approved" ? "text-green-400" : "text-red-400"
                    }`}>{r.status}</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-bold">
                    @{r.profile?.username ?? "unknown"} — {r.coins} coins (Rs {r.pkr_amount})
                  </p>
                  {r.kind === "withdraw" && (
                    <p className="text-xs text-muted-foreground">
                      Send to: <strong>{r.easypaisa_number}</strong> ({r.easypaisa_name})
                    </p>
                  )}
                  {r.admin_note && <p className="text-xs italic text-muted-foreground mt-1">Note: {r.admin_note}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {r.kind === "buy" && r.screenshot_url && (
                    <button
                      onClick={() => viewScreenshot(r.screenshot_url!)}
                      className="glass-btn h-8 px-2 text-xs flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" /> Proof
                    </button>
                  )}
                  {r.status === "pending" && (
                    <>
                      <button
                        onClick={() => resolve(r, true)}
                        disabled={acting === r.id}
                        className="glass-btn h-8 px-2 text-xs flex items-center gap-1 bg-green-500/30 text-green-300"
                      >
                        {acting === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Approve
                      </button>
                      <button
                        onClick={() => resolve(r, false)}
                        disabled={acting === r.id}
                        className="glass-btn h-8 px-2 text-xs flex items-center gap-1 bg-red-500/30 text-red-300"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment screenshot</DialogTitle>
            <DialogDescription>Verify the EasyPaisa transfer before approving.</DialogDescription>
          </DialogHeader>
          {previewUrl && (
            <img src={previewUrl} alt="Payment proof" className="w-full max-h-[70vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
