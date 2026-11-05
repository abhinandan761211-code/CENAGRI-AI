import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Plus, Send, Users } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  Input,
  LoadingRows,
  Modal,
  PageHeader,
  Panel,
  PrimaryButton,
  SearchBox,

  shortDate,
  Stat,
  Textarea,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import {
  addGroupPost,
  createGroup,
  farmerError,
  joinGroup,
  leaveGroup,
  listGroupPosts,
  listGroups,
} from "@/lib/farmer";
import type { FarmerGroup, GroupPost } from "@/lib/farmer";

/**
 * Farming Groups — discuss a crop or a block with other farmers.
 *
 * Groups are readable by every signed-in account (that is how you find one);
 * posting requires membership in the database, not just in this UI.
 */
export default function GroupsPage() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();
  const details = profile?.details ?? {};

  const [groups, setGroups] = useState<FarmerGroup[]>([]);
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [selected, setSelected] = useState<FarmerGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "district">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", crop: "", district: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [postBody, setPostBody] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setGroups(await listGroups());
    } catch (err) {
      setError(farmerError(err, "Could not load groups."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const loadPosts = useCallback(async (group: FarmerGroup) => {
    setLoadingPosts(true);
    try {
      setPosts(await listGroupPosts(group.id));
    } catch (err) {
      setError(farmerError(err, "Could not load the group's posts."));
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    if (selected) void loadPosts(selected);
  }, [selected, loadPosts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((group) => {
      if (filter === "mine" && !group.is_member) return false;
      if (filter === "district" && details.district && group.district !== details.district) return false;
      if (!q) return true;
      return [group.name, group.description, group.crop, group.district]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [groups, query, filter, details.district]);

  async function toggleMembership(group: FarmerGroup) {
    try {
      if (group.is_member) await leaveGroup(group.id);
      else await joinGroup(group.id);
      const next = { ...group, is_member: !group.is_member, member_count: (group.member_count ?? 0) + (group.is_member ? -1 : 1) };
      setGroups((prev) => prev.map((g) => (g.id === group.id ? next : g)));
      if (selected?.id === group.id) setSelected(next);
      showToast(group.is_member ? "Left the group" : "Joined the group");
    } catch (err) {
      setError(farmerError(err, "Could not update your membership."));
    }
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || draft.name.trim().length < 3) {
      setFormError("Give the group a name of at least 3 characters.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const group = await createGroup({
        name: draft.name,
        description: draft.description || undefined,
        crop: draft.crop || undefined,
        district: draft.district || details.district,
        state: details.state,
      });
      setCreateOpen(false);
      setDraft({ name: "", description: "", crop: "", district: "" });
      showToast("Group created");
      await load();
      setSelected({ ...group, is_member: true, member_count: 1 });
    } catch (err) {
      setFormError(farmerError(err, "Could not create the group."));
    } finally {
      setSaving(false);
    }
  }

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!selected || !postBody.trim()) return;
    setSaving(true);
    try {
      await addGroupPost(selected.id, postBody);
      setPostBody("");
      await loadPosts(selected);
    } catch (err) {
      setError(farmerError(err, "Could not post. Are you a member of this group?"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Users}
        title="Farming Groups"
        description="Join a group for your crop or block, ask questions, and share what is working on your land."
        actions={
          <PrimaryButton onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create group
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Groups" value={groups.length} icon={Users} hint="On Kalika" />
        <Stat label="You are in" value={groups.filter((g) => g.is_member).length} icon={Users} tone="green" hint="Your groups" />
        <Stat
          label="In your district"
          value={groups.filter((g) => details.district && g.district === details.district).length}
          icon={Users}
          tone="teal"
          hint={details.district ?? "District not set"}
        />
        <Stat
          label="Farmers reachable"
          value={groups.reduce((sum, g) => sum + (g.member_count ?? 0), 0)}
          icon={MessageSquare}
          tone="blue"
          hint="Total memberships"
        />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Panel flush>
          <div className="space-y-2 border-b border-slate-200 p-3">
            <SearchBox value={query} onChange={setQuery} placeholder="Search groups…" label="Search groups" />
            <div className="flex gap-1.5">
              {(["all", "mine", "district"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold capitalize ${
                    filter === option ? "bg-forest text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {option === "mine" ? "My groups" : option === "district" ? "My district" : "All"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <LoadingRows rows={4} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Users}
              title={groups.length === 0 ? "No groups yet" : "No groups match this filter"}
              body={
                groups.length === 0
                  ? "Create the first group for your crop or village. Other farmers can join and post questions."
                  : "Try “All” or another search."
              }
              action={
                <PrimaryButton onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> Create group
                </PrimaryButton>
              }
            />
          ) : (
            <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {visible.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(group)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selected?.id === group.id ? "bg-brand-50/60" : ""}`}
                  >
                    <p className="flex items-center gap-1.5 text-xs font-bold text-forest">
                      {group.name}
                      {group.is_member && <Chip tone="green">Joined</Chip>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{group.description ?? "No description"}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {group.member_count ?? 0} members · {group.crop ?? "All crops"} · {group.district ?? "State-wide"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={selected ? selected.name : "Select a group"}
          description={selected?.description ?? "Pick a group on the left to read and post."}
          icon={MessageSquare}
          action={
            selected && (
              <GhostButton className="h-8 px-2.5 text-[11px]" onClick={() => void toggleMembership(selected)}>
                {selected.is_member ? "Leave" : "Join"}
              </GhostButton>
            )
          }
        >
          {!selected ? (
            <EmptyState icon={Users} title="No group open" body="Choose a group to see the discussion." />
          ) : loadingPosts ? (
            <LoadingRows rows={3} />
          ) : (
            <>
              <ul className="max-h-[380px] divide-y divide-slate-100 overflow-y-auto">
                {posts.length === 0 ? (
                  <li className="px-4 py-8 text-center text-[11px] text-slate-500">
                    No posts yet. Start the discussion below.
                  </li>
                ) : (
                  posts.map((item) => (
                    <li key={item.id} className="px-4 py-3">
                      <p className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-forest">
                          {item.author_id === user?.id ? "You" : item.authorName ?? "Farmer"}
                        </span>
                        <span className="text-slate-400">{shortDate(item.created_at)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">{item.body}</p>
                    </li>
                  ))
                )}
              </ul>

              {selected.is_member ? (
                <form onSubmit={post} className="border-t border-slate-200 p-3">
                  <Textarea
                    rows={2}
                    value={postBody}
                    onChange={(e) => setPostBody(e.target.value)}
                    placeholder={`Post to ${selected.name}…`}
                    maxLength={2000}
                    aria-label="Write a post"
                  />
                  <div className="mt-2 flex justify-end">
                    <PrimaryButton type="submit" disabled={saving || !postBody.trim()}>
                      <Send className="h-3.5 w-3.5" /> {saving ? "Posting…" : "Post"}
                    </PrimaryButton>
                  </div>
                </form>
              ) : (
                <div className="border-t border-slate-200 p-3 text-center">
                  <p className="text-[11px] text-slate-500">Join this group to post.</p>
                  <PrimaryButton onClick={() => void toggleMembership(selected)} className="mt-2">
                    Join group
                  </PrimaryButton>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      <p className="text-[10px] text-slate-400">
        Be careful with personal information in public groups. For a private conversation use{" "}
        <Link to="/messages" className="font-semibold text-brand-700 hover:underline">
          Messages
        </Link>
        .
      </p>

      {createOpen && (
        <Modal
          title="Create a farming group"
          description="Give it a clear crop or place name so farmers can find it."
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <GhostButton onClick={() => setCreateOpen(false)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="group-form" disabled={saving}>
                {saving ? "Creating…" : "Create group"}
              </PrimaryButton>
            </>
          }
        >
          <form id="group-form" onSubmit={submitCreate} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Group name <span className="text-rose-500">*</span>
              </span>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Nadia paddy growers"
                required
                minLength={3}
                maxLength={120}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">About</span>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What is this group for?"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Crop</span>
                <Input
                  value={draft.crop}
                  onChange={(e) => setDraft({ ...draft, crop: e.target.value })}
                  placeholder="Paddy, vegetables…"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">District</span>
                <Input
                  value={draft.district}
                  onChange={(e) => setDraft({ ...draft, district: e.target.value })}
                  placeholder={details.district ?? "Your district"}
                />
              </label>
            </div>
            {formError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
            <p className="text-[10px] text-slate-400">
              You become the owner. Do not post private phone numbers or bank details.
            </p>
          </form>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}

