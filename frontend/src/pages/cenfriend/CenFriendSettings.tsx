import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Globe, Languages, Lock, Settings2, ShieldCheck, Unlock } from "lucide-react";

import CenFriendShell from "@/components/cenfriend/CenFriendShell";
import { PersonRow, SocialLoading } from "@/components/cenfriend/ui";
import { ErrorNote } from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { blockUser as _blockUser, getProfile, listBlocked, setPrivacy, unblockUser } from "@/lib/social";
import type { PersonCard, SocialProfile } from "@/lib/social";

/**
 * CenFriend settings — privacy, safety and the bridge to Creator Mode.
 *
 * Account privacy is one switch on the shared `profiles` row, not a new
 * account type. Turning it on means future follows need approval; it does not
 * change who the person is or which dashboard they land on.
 */
export default function CenFriendSettings() {
  const { profile: me } = useAuth();
  const [social, setSocial] = useState<SocialProfile | null>(null);
  const [blocked, setBlocked] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!me?.id) return;
    setLoading(true);
    setError("");
    try {
      const [profile, blocks] = await Promise.all([getProfile(me.id), listBlocked()]);
      setSocial(profile);
      setBlocked(blocks.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your settings.");
    } finally {
      setLoading(false);
    }
  }, [me?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePrivate(next: boolean) {
    if (!social) return;
    const previous = social.is_private;
    setSocial({ ...social, is_private: next });
    setSaving(true);
    setError("");
    try {
      await setPrivacy(next);
      setNotice(next ? "Your account is now private. New followers need your approval." : "Your account is public.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setSocial({ ...social, is_private: previous });
      setError(err instanceof Error ? err.message : "Could not change your privacy setting.");
    } finally {
      setSaving(false);
    }
  }

  async function unblock(person: PersonCard) {
    try {
      await unblockUser(person.id);
      setBlocked((rows) => rows.filter((r) => r.id !== person.id));
      setNotice("Unblocked.");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unblock this account.");
    }
  }

  void _blockUser;

  return (
    <CenFriendShell activeOverride="settings">
      <div className="mb-3">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-forest">CenFriend settings</h1>
        <p className="text-[11px] text-slate-500">Privacy, safety and how CenFriend connects to your other Kalika tools.</p>
      </div>

      {error && (
        <div className="mb-3">
          <ErrorNote message={error} />
        </div>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {notice}
        </p>
      )}

      {loading ? (
        <SocialLoading label="Loading settings…" />
      ) : (
        <div className="space-y-3">
          {/* Privacy */}
          <section className="creator-card p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-forest">
              <Lock className="h-3.5 w-3.5 text-brand-700" /> Account privacy
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              A private account approves every new follower. Your posts, photos and connections are shown only to
              people you accept. Existing followers stay.
            </p>
            <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void togglePrivate(false)}
                disabled={saving}
                aria-pressed={!social?.is_private}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition disabled:opacity-60 ${!social?.is_private ? "border-brand-700 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
              >
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                <span>
                  <span className="block text-[11px] font-bold text-forest">Public</span>
                  <span className="block text-[10px] leading-snug text-slate-500">
                    Anyone can follow you immediately and see public posts.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void togglePrivate(true)}
                disabled={saving}
                aria-pressed={!!social?.is_private}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition disabled:opacity-60 ${social?.is_private ? "border-brand-700 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <span>
                  <span className="block text-[11px] font-bold text-forest">Private</span>
                  <span className="block text-[10px] leading-snug text-slate-500">
                    New followers must be approved by you first.
                  </span>
                </span>
              </button>
            </div>
            <Link
              to="/cenfriend/requests"
              className="mt-2 inline-block text-[11px] font-bold text-brand-700 hover:underline"
            >
              Review follow requests →
            </Link>
          </section>

          {/* Blocked */}
          <section className="creator-card overflow-hidden">
            <p className="flex items-center gap-1.5 border-b border-slate-100 px-3.5 py-2.5 text-xs font-bold text-forest">
              <Ban className="h-3.5 w-3.5 text-rose-600" /> Blocked accounts
            </p>
            {blocked.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-[11px] text-slate-500">
                You have not blocked anyone. Block options are on each profile and post.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {blocked.map((person) => (
                  <li key={person.id}>
                    <PersonRow
                      person={person}
                      action={
                        <button
                          type="button"
                          onClick={() => void unblock(person)}
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <Unlock className="h-3 w-3" /> Unblock
                        </button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Existing settings — not duplicated */}
          <section className="creator-card p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-forest">
              <Settings2 className="h-3.5 w-3.5 text-brand-700" /> Other Kalika settings
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              These are the same settings used across your account — CenFriend does not keep its own copy.
            </p>
            <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
              <Link
                to="/account/language"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
              >
                <Languages className="h-4 w-4 text-brand-700" />
                <span className="text-[11px] font-bold text-forest">Language</span>
              </Link>
              <Link
                to="/account/notifications"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
              >
                <ShieldCheck className="h-4 w-4 text-brand-700" />
                <span className="text-[11px] font-bold text-forest">Notification preferences</span>
              </Link>
              <Link
                to="/account/privacy"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
              >
                <Lock className="h-4 w-4 text-brand-700" />
                <span className="text-[11px] font-bold text-forest">Password & sessions</span>
              </Link>
              <Link
                to="/video-hub?mode=create"
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
              >
                <ShieldCheck className="h-4 w-4 text-violet-600" />
                <span className="text-[11px] font-bold text-forest">Creator Studio</span>
              </Link>
            </div>
          </section>

          <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Blocking removes any follow in both directions and stops all interaction. Reports go to the Kalika
              moderation queue and are reviewed by our team — the account you reported is never told who reported it.
            </p>
          </div>
        </div>
      )}
    </CenFriendShell>
  );
}
