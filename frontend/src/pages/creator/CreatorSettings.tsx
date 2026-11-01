import { useState } from "react";
import { ImagePlus, KeyRound, Save } from "lucide-react";
import CreatorShell, { CreatorSection } from "@/components/creator/CreatorShell";
import { useAuth } from "@/hooks/useAuth";
import { useCreatorChannel } from "@/hooks/useCreatorChannel";
import { LANGUAGES, saveChannel } from "@/lib/creator";
import type { ChannelInput } from "@/lib/creator";
import { ACCEPTED_IMAGE_TYPES, uploadImage } from "@/lib/storage";

/**
 * Settings — create or edit the channel.
 *
 * The channel row is the anchor for every other creator table (`videos`
 * references it), so this screen also doubles as "create your channel".
 */
export default function CreatorSettings() {
  const { profile, user, updatePassword } = useAuth();
  const { channel, state, error, reload } = useCreatorChannel();

  const [form, setForm] = useState<ChannelInput>(() => ({
    channel_name: channel?.channel_name ?? profile?.full_name ?? "",
    handle: channel?.handle ?? null,
    description: channel?.description ?? null,
    avatar_url: channel?.avatar_url ?? null,
    banner_url: channel?.banner_url ?? null,
    state: channel?.state ?? profile?.details?.state ?? null,
    district: channel?.district ?? profile?.details?.district ?? null,
    expertise: channel?.expertise ?? [],
    languages: channel?.languages ?? [],
    website: channel?.website ?? null,
  }));
  const [expertiseText, setExpertiseText] = useState((channel?.expertise ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwNotice, setPwNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function set<K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function uploadTo(field: "avatar_url" | "banner_url", file: File | undefined) {
    if (!file) return;
    setNotice(null);
    try {
      const { url } = await uploadImage(file, "channel-banners");
      set(field, url);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.channel_name.trim().length < 2) {
      setNotice({ kind: "err", text: "Channel name must be at least 2 characters." });
      return;
    }
    const handle = form.handle?.trim().toLowerCase() || null;
    if (handle && !/^[a-z0-9_]{3,30}$/.test(handle)) {
      setNotice({ kind: "err", text: "Handle can use a–z, 0–9 and _ (3–30 characters)." });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      await saveChannel({
        ...form,
        channel_name: form.channel_name.trim(),
        handle,
        expertise: expertiseText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 8),
      });
      await reload();
      setNotice({ kind: "ok", text: "Channel saved." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the channel.";
      setNotice({
        kind: "err",
        text: /duplicate|unique/i.test(message) ? "That handle is already taken." : message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setPwNotice({ kind: "err", text: "Use at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setPwNotice({ kind: "err", text: "The two passwords do not match." });
      return;
    }
    try {
      await updatePassword(password);
      setPwNotice({ kind: "ok", text: "Password updated." });
      setPassword("");
      setConfirm("");
    } catch (err) {
      setPwNotice({ kind: "err", text: err instanceof Error ? err.message : "Could not update." });
    }
  }

  return (
    <CreatorShell
      title={channel ? "Channel settings" : "Create your channel"}
      subtitle={channel ? "Name, banner, expertise and topic" : "A channel is required before you can upload"}
    >
      {state === "error" && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
          {error}
        </p>
      )}

      <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CreatorSection title="Identity">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="creator-label">Channel name *</span>
                <input
                  value={form.channel_name}
                  onChange={(e) => set("channel_name", e.target.value)}
                  placeholder="e.g. Krishi Gyan Bangla"
                  className="creator-input"
                />
              </label>

              <label className="block">
                <span className="creator-label">Handle</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-500">@</span>
                  <input
                    value={form.handle ?? ""}
                    onChange={(e) => set("handle", e.target.value.toLowerCase())}
                    placeholder="krishigyan"
                    className="creator-input"
                  />
                </div>
                <span className="mt-1 block text-[10px] text-slate-500">
                  Must be unique across CenAGRI.
                </span>
              </label>

              <label className="block">
                <span className="creator-label">Website</span>
                <input
                  value={form.website ?? ""}
                  onChange={(e) => set("website", e.target.value || null)}
                  placeholder="https://"
                  className="creator-input"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="creator-label">Description</span>
                <textarea
                  rows={3}
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value || null)}
                  placeholder="What do you teach farmers?"
                  className="creator-input"
                />
              </label>
            </div>
          </CreatorSection>

          <CreatorSection title="Expertise & audience">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="creator-label">Farming expertise (comma separated)</span>
                <input
                  value={expertiseText}
                  onChange={(e) => setExpertiseText(e.target.value)}
                  placeholder="Paddy, Organic farming, Poultry"
                  className="creator-input"
                />
              </label>

              <div className="sm:col-span-2">
                <span className="creator-label">Languages you publish in</span>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.filter((l) => l !== "Other").map((language) => {
                    const active = (form.languages ?? []).includes(language);
                    return (
                      <button
                        key={language}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          set(
                            "languages",
                            active
                              ? (form.languages ?? []).filter((l) => l !== language)
                              : [...(form.languages ?? []), language]
                          )
                        }
                        className={`creator-chip ${active ? "is-active" : ""}`}
                      >
                        {language}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="creator-label">State</span>
                <input
                  value={form.state ?? ""}
                  onChange={(e) => set("state", e.target.value || null)}
                  placeholder="e.g. West Bengal"
                  className="creator-input"
                />
              </label>
              <label className="block">
                <span className="creator-label">District</span>
                <input
                  value={form.district ?? ""}
                  onChange={(e) => set("district", e.target.value || null)}
                  placeholder="e.g. Nadia"
                  className="creator-input"
                />
              </label>
            </div>
          </CreatorSection>

          {notice && (
            <p
              className={`rounded-lg px-3 py-2 text-[11px] ${
                notice.kind === "ok"
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border border-rose-500/30 bg-rose-500/10 text-rose-300"
              }`}
            >
              {notice.text}
            </p>
          )}

          <button type="submit" disabled={saving} className="creator-btn-primary h-10 px-5 text-xs">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : channel ? "Save channel" : "Create channel"}
          </button>
        </div>

        <div className="space-y-4">
          <CreatorSection title="Avatar & banner">
            <div className="space-y-3 p-4">
              <div>
                <span className="creator-label">Avatar</span>
                <div className="flex items-center gap-3">
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#16C784]/15 text-sm font-bold text-[#16C784]">
                    {form.avatar_url ? (
                      <img src={form.avatar_url} alt="" className="h-14 w-14 object-cover" />
                    ) : (
                      (form.channel_name || "CA").slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <label className="creator-btn-ghost h-8 cursor-pointer px-3 text-[11px]">
                    <ImagePlus className="h-3 w-3" /> Upload
                    <input
                      type="file"
                      accept={ACCEPTED_IMAGE_TYPES}
                      className="hidden"
                      onChange={(e) => void uploadTo("avatar_url", e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              <div>
                <span className="creator-label">Banner</span>
                <div className="mb-2 h-20 w-full overflow-hidden rounded-lg bg-white/5">
                  {form.banner_url && (
                    <img src={form.banner_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <label className="creator-btn-ghost h-8 w-full cursor-pointer text-[11px]">
                  <ImagePlus className="h-3 w-3" /> Upload banner
                  <input
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    className="hidden"
                    onChange={(e) => void uploadTo("banner_url", e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
          </CreatorSection>

          <CreatorSection title="Account">
            <div className="p-4 text-[11px] leading-relaxed text-slate-400">
              Signed in as{" "}
              <span className="font-semibold text-white">{profile?.email ?? user?.email}</span>
              {profile?.role && <> · role: {profile.role}</>}
            </div>
          </CreatorSection>

          <CreatorSection title="Password">
            <form onSubmit={handlePassword} className="space-y-2 p-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="creator-input"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="creator-input"
              />
              {pwNotice && (
                <p className={`text-[11px] ${pwNotice.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
                  {pwNotice.text}
                </p>
              )}
              <button
                type="submit"
                disabled={!password}
                className="creator-btn-ghost h-9 w-full text-[11px]"
              >
                <KeyRound className="h-3 w-3" /> Update password
              </button>
            </form>
          </CreatorSection>
        </div>
      </form>
    </CreatorShell>
  );
}
