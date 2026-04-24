import { supabase } from "@/integrations/supabase/client";

/**
 * Wrapper around `finalize_match` that enforces the rule:
 * "When the human is playing a FAKE-USER (challenge from Online Players), the
 *  bot must win 99% of the time, regardless of the actual game outcome."
 *
 * `humanWon` is the result the game engine determined.
 * `isFakeUserMatch` should be true when the bot is impersonating a fake user
 * (i.e. `matches.state.fake_opponent` is set, or the match was created via
 * `start_match_with_fake_user`).
 *
 * Pass `humanUserId` so we can mark them as winner only in the rare 1% lucky
 * case; otherwise we pass `null` (bot wins → human loses bet).
 */
export async function finalizePaidBotMatch(opts: {
  matchId: string;
  humanUserId: string;
  humanWon: boolean;
  isFakeUserMatch: boolean;
}): Promise<{ error: unknown | null; humanWonFinal: boolean }> {
  const { matchId, humanUserId, humanWon, isFakeUserMatch } = opts;

  let humanWonFinal = humanWon;
  if (isFakeUserMatch) {
    // 99% bot win regardless of game outcome. Only allow human win on a 1% roll.
    const luckyEscape = Math.random() < 0.01;
    humanWonFinal = humanWon && luckyEscape;
  }

  const { error } = await supabase.rpc("finalize_match", {
    _match_id: matchId,
    _winner_id: humanWonFinal ? humanUserId : null,
  });
  return { error, humanWonFinal };
}
