import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Loader2, Trophy, Coins, Swords, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function Profile() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name ?? "");
  }, [profile]);

  const onPickAvatar = () => fileRef.current?.click();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    await refreshProfile();
    toast({ title: "Avatar updated" });
    setUploading(false);
  };

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() || null }).eq("id", user.id);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else { await refreshProfile(); toast({ title: "Profile saved" }); }
    setSaving(false);
  };

  if (!profile) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  }

  const initials = (s?: string | null) => (s ?? "?").slice(0, 2).toUpperCase();
  const winrate = profile.wins + profile.losses > 0 ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : 0;

  return (
    <main className="min-h-screen px-4 py-6">
      <header className="mx-auto mb-6 flex max-w-3xl items-center justify-between">
        <button onClick={() => navigate("/lobby")} className="glass-btn h-10 flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> <span className="text-sm">Back</span>
        </button>
        <h1 className="text-xl font-black text-glow">My Profile</h1>
        <div className="w-10" />
      </header>

      <section className="mx-auto max-w-3xl space-y-4">
        <div className="glass rounded-3xl p-6 neon-border">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="h-24 w-24 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/50 to-accent/50 text-3xl font-black">
                  {initials(profile.username)}
                </div>
              )}
              <button
                onClick={onPickAvatar}
                disabled={uploading}
                className="absolute -bottom-2 -right-2 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 transition"
                aria-label="Change avatar"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
            </div>
            <div className="flex-1 w-full text-center sm:text-left">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">@{profile.username}</p>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="bg-secondary/50 mt-2 max-w-sm"
              />
              <button onClick={onSave} disabled={saving} className="glass-btn mt-3 inline-flex items-center gap-2 text-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard icon={<Coins />} label="Coins" value={profile.coins} color="text-yellow-400" />
          <StatCard icon={<Trophy />} label="Wins" value={profile.wins} color="text-green-400" />
          <StatCard icon={<Swords />} label="Losses" value={profile.losses} color="text-red-400" />
          <StatCard icon={<Trophy />} label="Win Rate" value={`${winrate}%`} color="text-primary" />
        </div>
      </section>
    </main>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4 text-center">
      <div className={`flex justify-center ${color} mb-1`}>{icon}</div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}
