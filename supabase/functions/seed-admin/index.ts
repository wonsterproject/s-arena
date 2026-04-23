// One-off admin seed function. Creates the wonster admin if missing, grants admin role.
// Safe to call multiple times.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const username = "wonster";
    const password = "tahafairy786";
    const email = "wonster@admin.local";

    // Try create — if already exists we'll fetch instead
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (createErr && !String(createErr.message ?? "").toLowerCase().includes("already")) {
      throw createErr;
    }
    userId = created?.user?.id ?? null;

    if (!userId) {
      // Find by listing
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users?.find((u) => u.email === email);
      if (!found) throw new Error("User not found after create attempt");
      userId = found.id;
      // Make sure the password is updated to the desired one
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    }

    // Ensure profile username
    await admin.from("profiles").update({ username, display_name: username }).eq("id", userId);

    // Grant admin role
    await admin.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

    return new Response(
      JSON.stringify({ ok: true, user_id: userId, username, email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
