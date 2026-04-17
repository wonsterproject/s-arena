import { useEffect, useRef, useState } from "react";
import { Send, Smile, MessageSquare, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ChatMsg {
  id: string;
  user_id: string;
  message: string;
  kind: string;
  created_at: string;
  username?: string;
}

const EMOJIS = ["👋", "😂", "😮", "👍", "🔥", "🎉", "😢", "😡", "🙏", "💀", "🏆", "🎲"];

export function MatchChat({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!matchId) return;
    void load();
    const ch = supabase
      .channel(`chat-${matchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_chat", filter: `match_id=eq.${matchId}` },
        async (payload) => {
          const m = payload.new as ChatMsg;
          const { data: prof } = await supabase.from("profiles").select("username").eq("id", m.user_id).maybeSingle();
          setMsgs((prev) => [...prev, { ...m, username: prof?.username }]);
          if (!open && m.user_id !== user?.id) setUnread((u) => u + 1);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, open, user?.id]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
    }
  }, [open, msgs]);

  const load = async () => {
    const { data } = await supabase
      .from("match_chat")
      .select("id, user_id, message, kind, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (data) {
      const ids = Array.from(new Set(data.map((d) => d.user_id)));
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p.username]));
      setMsgs(data.map((d) => ({ ...d, username: map.get(d.user_id) })));
    }
  };

  const send = async (text: string, kind: "text" | "emoji" = "text") => {
    if (!user || !text.trim()) return;
    await supabase.from("match_chat").insert({ match_id: matchId, user_id: user.id, message: text.trim().slice(0, 200), kind });
    setInput("");
    setShowEmoji(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl hover:scale-105 transition"
        aria-label="Open chat"
      >
        <MessageSquare className="h-6 w-6 text-primary-foreground" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] sm:w-80 h-[60vh] sm:h-96 glass rounded-2xl flex flex-col neon-border overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border/40 bg-secondary/30">
        <p className="font-bold text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Match Chat</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Say hi 👋</p>}
        {msgs.map((m) => {
          const mine = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-1.5 ${mine ? "bg-primary/30" : "bg-secondary/60"}`}>
                {!mine && <p className="text-[10px] font-bold text-primary mb-0.5">@{m.username ?? "?"}</p>}
                <p className={`${m.kind === "emoji" ? "text-2xl" : "text-sm"} break-words`}>{m.message}</p>
              </div>
            </div>
          );
        })}
      </div>
      {showEmoji && (
        <div className="grid grid-cols-6 gap-1 p-2 border-t border-border/40 bg-secondary/30">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => send(e, "emoji")} className="text-2xl p-1 rounded hover:bg-secondary">{e}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 p-2 border-t border-border/40">
        <button onClick={() => setShowEmoji((v) => !v)} className="glass-btn h-9 w-9 !p-0 flex items-center justify-center">
          <Smile className="h-4 w-4" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Message..."
          maxLength={200}
          className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={() => send(input)} disabled={!input.trim()} className="glass-btn h-9 w-9 !p-0 flex items-center justify-center bg-primary/30">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
