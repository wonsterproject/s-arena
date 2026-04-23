import { useEffect, useRef, useState } from "react";
import { Coins, Loader2, Upload, Wallet, Plus, Minus, Clock, CheckCircle2, XCircle, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PaymentSettings {
  easypaisa_number: string;
  easypaisa_name: string;
}

interface PaymentRequest {
  id: string;
  kind: "buy" | "withdraw";
  coins: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  admin_note: string | null;
}

export default function CoinsPanel() {
  const { user, profile, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"buy" | "withdraw" | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [history, setHistory] = useState<PaymentRequest[]>([]);
  const [coins, setCoins] = useState<number>(500);
  const [epNumber, setEpNumber] = useState("");
  const [epName, setEpName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const load = async () => {
    const [{ data: s }, { data: h }] = await Promise.all([
      supabase.from("payment_settings").select("easypaisa_number, easypaisa_name").maybeSingle(),
      supabase.from("payment_requests").select("id, kind, coins, status, created_at, admin_note")
        .order("created_at", { ascending: false }).limit(10),
    ]);
    if (s) setSettings(s as PaymentSettings);
    setHistory((h ?? []) as PaymentRequest[]);
  };

  const reset = () => {
    setMode(null);
    setCoins(500);
    setEpNumber("");
    setEpName("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitBuy = async () => {
    if (!user) return;
    if (coins < 100) return toast({ title: "Minimum 100 coins", variant: "destructive" });
    if (!file) return toast({ title: "Screenshot zaroori hai", variant: "destructive" });

    setSubmitting(true);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file, {
        cacheControl: "3600", upsert: false,
      });
      if (upErr) throw upErr;
      setUploading(false);

      const { error } = await supabase.rpc("request_buy_coins", {
        _coins: coins,
        _screenshot_url: path,
      });
      if (error) throw error;
      toast({ title: "Buy request submitted!", description: "Admin approval kay baad coins mil jayein gay." });
      reset();
      await load();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message ?? "Try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const submitWithdraw = async () => {
    if (!user) return;
    if (coins < 1000) return toast({ title: "Minimum 1000 coins", variant: "destructive" });
    if (epNumber.trim().length < 10) return toast({ title: "EasyPaisa number invalid", variant: "destructive" });
    if (epName.trim().length < 2) return toast({ title: "Account holder name required", variant: "destructive" });

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("request_withdraw_coins", {
        _coins: coins,
        _easypaisa_number: epNumber.trim(),
        _easypaisa_name: epName.trim(),
      });
      if (error) throw error;
      toast({ title: "Withdraw request submitted!", description: "Coins lock ho gaye. Admin approve karte hi PKR aap kay account me." });
      reset();
      await Promise.all([refreshProfile(), load()]);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message ?? "Try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode(mode === "buy" ? null : "buy")}
          className={`glass-btn h-12 flex items-center justify-center gap-2 font-bold ${
            mode === "buy" ? "bg-gradient-to-r from-green-500/40 to-emerald-500/40" : ""
          }`}
        >
          <Plus className="h-4 w-4 text-green-400" /> Buy Coins
        </button>
        <button
          onClick={() => setMode(mode === "withdraw" ? null : "withdraw")}
          className={`glass-btn h-12 flex items-center justify-center gap-2 font-bold ${
            mode === "withdraw" ? "bg-gradient-to-r from-orange-500/40 to-red-500/40" : ""
          }`}
        >
          <Minus className="h-4 w-4 text-orange-400" /> Withdraw
        </button>
      </div>

      {/* Buy form */}
      {mode === "buy" && (
        <div className="glass rounded-2xl p-4 space-y-3 border border-green-500/30">
          <div>
            <Label className="text-xs">Quantity (coins) — 1 PKR = 1 coin</Label>
            <Input
              type="number"
              min={100}
              value={coins}
              onChange={(e) => setCoins(Math.max(0, Number(e.target.value)))}
              className="bg-secondary/50 mt-1"
              placeholder="e.g. 500"
            />
            <p className="text-xs text-muted-foreground mt-1">Aap pay karein gay: <strong>Rs {coins}</strong></p>
          </div>

          {settings && (
            <div className="rounded-xl bg-gradient-to-br from-green-500/15 to-emerald-500/10 border border-green-500/30 p-3">
              <p className="text-xs uppercase tracking-widest text-green-400 mb-1">EasyPaisa par send karein</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Number:</span>
                <span className="font-bold tracking-wider">{settings.easypaisa_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Name:</span>
                <span className="font-bold">{settings.easypaisa_name}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Amount:</span>
                <span className="font-black text-green-400">Rs {coins}</span>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Screenshot of payment</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="glass-btn h-10 flex-1 flex items-center justify-center gap-2 text-sm"
              >
                {file ? <ImageIcon className="h-4 w-4 text-green-400" /> : <Upload className="h-4 w-4" />}
                <span className="truncate max-w-[200px]">{file ? file.name : "Upload screenshot"}</span>
              </button>
            </div>
          </div>

          <button
            onClick={submitBuy}
            disabled={submitting || !file || coins < 100}
            className="w-full glass-btn h-11 bg-gradient-to-r from-green-500/40 to-emerald-500/40 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {uploading ? "Uploading..." : "Submit Request"}
          </button>
        </div>
      )}

      {/* Withdraw form */}
      {mode === "withdraw" && (
        <div className="glass rounded-2xl p-4 space-y-3 border border-orange-500/30">
          <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-2 text-xs text-orange-300">
            Min 1000 coins · 1 coin = 1 PKR · Coins lock ho jayein gay until admin approve
          </div>
          {(profile?.referral_locked_coins ?? 0) > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-300">
              <strong>{profile?.referral_locked_coins?.toLocaleString()}</strong> coins are locked (referral bonus). Withdrawable: <strong>{Math.max(0, (profile?.coins ?? 0) - (profile?.referral_locked_coins ?? 0)).toLocaleString()}</strong>
            </div>
          )}
          <div>
            <Label className="text-xs">Quantity (coins to withdraw)</Label>
            <Input
              type="number"
              min={1000}
              value={coins}
              onChange={(e) => setCoins(Math.max(0, Number(e.target.value)))}
              className="bg-secondary/50 mt-1"
              placeholder="e.g. 1000"
            />
            <p className="text-xs text-muted-foreground mt-1">Aap ko milein gay: <strong>Rs {coins}</strong></p>
          </div>
          <div>
            <Label className="text-xs">Apka EasyPaisa number</Label>
            <Input
              value={epNumber}
              onChange={(e) => setEpNumber(e.target.value)}
              className="bg-secondary/50 mt-1"
              placeholder="03XXXXXXXXX"
              maxLength={15}
            />
          </div>
          <div>
            <Label className="text-xs">Account holder name</Label>
            <Input
              value={epName}
              onChange={(e) => setEpName(e.target.value)}
              className="bg-secondary/50 mt-1"
              placeholder="Full name as on EasyPaisa"
              maxLength={100}
            />
          </div>
          <button
            onClick={submitWithdraw}
            disabled={submitting || coins < 1000}
            className="w-full glass-btn h-11 bg-gradient-to-r from-orange-500/40 to-red-500/40 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Submit Request
          </button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="glass rounded-2xl p-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Recent requests</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {history.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2">
                  {r.status === "pending" ? <Clock className="h-3 w-3 text-yellow-400" /> :
                   r.status === "approved" ? <CheckCircle2 className="h-3 w-3 text-green-400" /> :
                   <XCircle className="h-3 w-3 text-red-400" />}
                  <span className="capitalize font-semibold">{r.kind}</span>
                  <span className="text-muted-foreground">{r.coins}c</span>
                </div>
                <span className={`text-[10px] uppercase font-bold ${
                  r.status === "pending" ? "text-yellow-400" :
                  r.status === "approved" ? "text-green-400" : "text-red-400"
                }`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
