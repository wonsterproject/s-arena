import { PlayerColor, Token } from "./ludoConstants";

/** Returns IDs of tokens the player can move with the given dice roll. */
export function getMovableTokens(tokens: Token[], player: PlayerColor, dice: number): string[] {
  return tokens
    .filter((t) => t.player === player)
    .filter((t) => {
      if (t.state === "finished") return false;
      if (t.state === "base") return dice === 6;
      return t.progress + dice <= 56;
    })
    .map((t) => t.id);
}

/**
 * Simple bot strategy:
 * 1. If can finish a token → do it.
 * 2. If can kill an opponent → do it.
 * 3. If rolled a 6 and has a token in base → release it.
 * 4. Otherwise move the most advanced token.
 */
export function chooseBotMove(tokens: Token[], player: PlayerColor, dice: number): string | null {
  const playerTokens = tokens.filter((t) => t.player === player);
  const movable = getMovableTokens(tokens, player, dice);
  if (movable.length === 0) return null;

  const movableTokens = playerTokens.filter((t) => movable.includes(t.id));

  // 1. Finish move
  const finisher = movableTokens.find((t) => t.state === "active" && t.progress + dice === 56);
  if (finisher) return finisher.id;

  // 2. Kill move (we don't compute exact kill detection; approximate by preferring active tokens that land on opponent cell)
  // For simplicity: prefer active token already past base.
  // 3. Release a token from base
  if (dice === 6) {
    const base = movableTokens.find((t) => t.state === "base");
    if (base) return base.id;
  }

  // 4. Most advanced active token
  const active = movableTokens.filter((t) => t.state === "active").sort((a, b) => b.progress - a.progress);
  if (active.length > 0) return active[0].id;

  return movableTokens[0].id;
}
