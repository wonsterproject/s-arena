import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: loginError } = await supabase.auth.signInWithPassword({ email: 'wonster@admin.local', password: 'tahaking' });
if (loginError) {
  console.error(JSON.stringify({ stage: 'login', error: loginError }, null, 2));
  process.exit(1);
}
const { data, error } = await supabase.rpc('create_bot_match');
console.log(JSON.stringify({ stage: 'rpc', data, error }, null, 2));
await supabase.auth.signOut();
