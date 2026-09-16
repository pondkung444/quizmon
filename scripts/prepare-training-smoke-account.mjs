import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";

const folder = "output/raid-clarity-2026-09-16";
const credentialPath = `${folder}/new-player-registered-credentials.json`;
if (await access(credentialPath).then(() => true, () => false)) {
  console.log("Registered disposable account already prepared");
} else {
  const state = JSON.parse(await readFile(`${folder}/new-player-auth.json`, "utf8"));
  const cookies = state.cookies.filter(cookie => /auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a, b) => a.name.localeCompare(b.name));
  const value = decodeURIComponent(cookies.map(cookie => cookie.value).join(""));
  const session = JSON.parse(value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString() : value);
  const userId = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()).sub;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const [{ data: profile, error: profileError }, { data: pet, error: petError }] = await Promise.all([
    admin.from("profiles").select("username").eq("id", userId).single(),
    admin.from("pets").select("nickname").eq("user_id", userId).eq("is_active", true).single(),
  ]);
  if (profileError || petError || !profile.username.startsWith("UXP3") || pet.nickname !== "UX ฝึกครบวัน") throw new Error("Refusing to modify any account other than this run's disposable training account");
  const credentials = { email: `uxp3-${userId}@example.com`, password: randomBytes(24).toString("base64url") };
  const { data, error } = await admin.auth.admin.updateUserById(userId, { ...credentials, email_confirm: true });
  if (error) throw new Error(error.message);
  if (data.user.is_anonymous) throw new Error("Disposable account was not converted to registered");
  await writeFile(credentialPath, JSON.stringify(credentials), { mode: 0o600 });
  console.log("Converted only this run's disposable account to registered; credentials saved locally");
}
