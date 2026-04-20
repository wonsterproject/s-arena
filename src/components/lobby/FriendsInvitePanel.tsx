import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Swords, Loader2, UserPlus } from "lucide-react";
import { useFriendInvite, type GameType } from "@/hooks/useFriendInvite";
import BetDialog from "@/components/lobby/BetDialog";

interface Props {
  game: GameType;
  gameLabel: string;
  /** If false, hide 2v2 button (e.g. chess/pool/carrom 1v1 only). Default true. */
  show2v2?: boolean;
}

const initials = (s?: string | null) => (s ?? "?").slice(0, 2).toUpperCase();

export default function FriendsInvitePanel({ game, gameLabel, show2v2 = false }: Props) {
  const navigate = useNavigate();
  const { friends, loadingFriends, creating, invite, profile } = useFriendInvite(game);
  const [betDialog, setBetDialog] = useState<{ friendId: string; friendName: string; mode: "1v1" | "2v2" } | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
          Play with Friends · Bet coins (min 50)
        </h2>
        <button
          onClick={() => navigate("/lobby")}
          className="glass-btn h-8 text-xs flex items-center gap-1"
        >
          <UserPlus className="h-3 w-3" /> Add friends
        </button>
      </div>

      <div className="glass rounded-2xl p-4">
        {loadingFriends ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading friends…
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No friends yet. <button onClick={() => navigate("/lobby")} className="text-primary underline">Add some</button> to challenge them at {gameLabel}.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-auto">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 text-xs font-bold">
                  {initials(f.username)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">@{f.username}</p>
                  <p className="text-xs text-muted-foreground">🏆 {f.wins} · 🪙 {f.coins}</p>
                </div>
                <button
                  onClick={() => setBetDialog({ friendId: f.id, friendName: f.username, mode: "1v1" })}
                  disabled={creating}
                  className="glass-btn h-8 text-xs flex items-center gap-1 bg-primary/30"
                >
                  <Swords className="h-3 w-3" /> 1v1
                </button>
                {show2v2 && (
                  <button
                    onClick={() => setBetDialog({ friendId: f.id, friendName: f.username, mode: "2v2" })}
                    disabled={creating}
                    className="glass-btn h-8 text-xs flex items-center gap-1"
                  >
                    <Users className="h-3 w-3" /> 2v2
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {betDialog && (
        <BetDialog
          open={!!betDialog}
          onClose={() => setBetDialog(null)}
          friendName={betDialog.friendName}
          mode={betDialog.mode}
          maxCoins={profile?.coins ?? 0}
          minBet={50}
          gameLabel={gameLabel}
          onConfirm={async (bet) => {
            await invite(betDialog.friendId, betDialog.mode, bet);
          }}
        />
      )}
    </div>
  );
}
