import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Options {
  /** Active online match id. Falsy disables the hook. */
  matchId: string | null | undefined;
  /** Current user's id. */
  userId: string | null | undefined;
  /** Opponent's user id (real human). Falsy disables (e.g. bot matches). */
  opponentId: string | null | undefined;
  /** True if the match is still active (not finished/cancelled). */
  active: boolean;
  /** Seconds the opponent must stay gone before forfeit. Default 15s — tolerates refresh. */
  graceSeconds?: number;
  /** Called after we successfully claim the win. */
  onWin?: () => void;
}

/**
 * Tracks both players via Supabase Realtime presence.
 *
 * Behavior:
 *  - Both players "track" themselves on channel `match-presence:{matchId}`.
 *  - We wait until we have actually SEEN the opponent at least once (avoids
 *    crashing the start of a match where they're still loading).
 *  - If the opponent then leaves and stays gone for `graceSeconds`, we
 *    finalize the match with ourselves as the winner.
 *  - A page refresh re-subscribes within ~1–3s, well inside the grace window,
 *    so the match resumes from DB state instead of forfeiting.
 */
export function useMatchPresence({
  matchId,
  userId,
  opponentId,
  active,
  graceSeconds = 15,
  onWin,
}: Options) {
  const claimedRef = useRef(false);
  const seenOpponentRef = useRef(false);

  useEffect(() => {
    if (!matchId || !userId || !opponentId || !active) return;
    if (claimedRef.current) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const channelName = `match-presence:${matchId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });

    const cancelTimer = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    const claimWin = async () => {
      if (claimedRef.current) return;
      claimedRef.current = true;
      const { error } = await supabase.rpc("finalize_match", {
        _match_id: matchId,
        _winner_id: userId,
      });
      if (!error) {
        toast({
          title: "Opponent left the match",
          description: "You win the bet pot 🏆",
        });
        onWin?.();
      } else {
        // someone else already finalized it — that's fine
        claimedRef.current = false;
      }
    };

    const evaluatePresence = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      const opponentHere = Array.isArray(state[opponentId]) && state[opponentId].length > 0;

      if (opponentHere) {
        seenOpponentRef.current = true;
        cancelTimer();
        return;
      }

      // Only start the forfeit countdown after we've actually seen the opponent
      // at least once — avoids false positives at match start.
      if (!seenOpponentRef.current) return;

      if (!timer) {
        timer = setTimeout(() => { void claimWin(); }, graceSeconds * 1000);
      }
    };

    channel
      .on("presence", { event: "sync" }, evaluatePresence)
      .on("presence", { event: "join" }, evaluatePresence)
      .on("presence", { event: "leave" }, evaluatePresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      cancelTimer();
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [matchId, userId, opponentId, active, graceSeconds, onWin]);
}
