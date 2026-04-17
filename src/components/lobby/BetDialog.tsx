import { useState } from "react";
import { Coins, Loader2, Swords, Users, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onClose: () => void;
  friendName: string;
  mode: "1v1" | "2v2";
  maxCoins: number;
  onConfirm: (bet: number) => Promise<void> | void;
}

const PRESETS = [0, 100, 500, 1000, 5000];

export default function BetDialog({ open, onClose, friendName, mode, maxCoins, onConfirm }: Props) {
  const [bet, setBet] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(bet);
      onClose();
      setBet(0);
    } finally {
      setSubmitting(false);
    }
  };

  const tooHigh = bet > maxCoins;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "1v1" ? <Swords className="h-5 w-5 text-primary" /> : <Users className="h-5 w-5 text-primary" />}
            Invite @{friendName} — {mode}
          </DialogTitle>
          <DialogDescription>
            Bet coins lagao. Winner takes all. 0 ka matlab friendly match (no coins).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Your balance:</span>
            <span className="flex items-center gap-1 font-bold">
              <Coins className="h-4 w-4 text-yellow-400" /> {maxCoins}
            </span>
          </div>

          <div>
            <Label className="text-xs">Bet amount per player</Label>
            <Input
              type="number"
              min={0}
              max={maxCoins}
              value={bet}
              onChange={(e) => setBet(Math.max(0, Math.min(maxCoins, Number(e.target.value))))}
              className="bg-secondary/50 mt-1 text-lg font-bold"
            />
            {tooHigh && <p className="text-xs text-red-400 mt-1">Aap kay paas itne coins nahi hain</p>}
            {bet > 0 && !tooHigh && (
              <p className="text-xs text-muted-foreground mt-1">
                Pot total: <strong>{bet * (mode === "1v1" ? 2 : 4)} coins</strong> · winner takes all
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setBet(p)}
                disabled={p > maxCoins}
                className={`glass-btn h-8 px-3 text-xs ${bet === p ? "bg-primary/30" : ""} disabled:opacity-30`}
              >
                {p === 0 ? "Free" : p}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button onClick={onClose} disabled={submitting} className="glass-btn h-10 px-4 flex items-center gap-1">
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || tooHigh || bet < 0}
            className="glass-btn h-10 px-4 bg-gradient-to-r from-primary/40 to-accent/40 font-bold flex items-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4 text-yellow-400" />}
            Send Invite {bet > 0 ? `(${bet}c)` : ""}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
