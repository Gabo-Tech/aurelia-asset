import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Toaster, toast } from "sonner";
import { Loader2, Plus, Save, Trash2, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  checkAdminPassword,
  getSponsors,
  saveSponsors,
} from "@/lib/sponsors.functions";
import {
  DEFAULT_SPONSORS,
  type Sponsor,
  type SponsorsFile,
} from "@/lib/sponsors-types";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Sponsors" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function newSponsor(): Sponsor {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    logoUrl: "",
    url: "https://",
    tagline: "",
    active: true,
    weight: 1,
  };
}

function AdminPage() {
  const check = useServerFn(checkAdminPassword);
  const load = useServerFn(getSponsors);
  const save = useServerFn(saveSponsors);

  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<SponsorsFile>(DEFAULT_SPONSORS);

  async function hydrate() {
    setLoading(true);
    try {
      const data = await load();
      setFile({
        rotationSeconds: data.rotationSeconds ?? 20,
        sponsors: data.sponsors ?? [],
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    try {
      const res = await check({ data: { password: pw } });
      if (!res.ok) {
        toast.error("Wrong password");
        return;
      }
      setAuthed(true);
      await hydrate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  function logout() {
    setAuthed(false);
    setPw("");
  }

  function updateSponsor(id: string, patch: Partial<Sponsor>) {
    setFile((f) => ({
      ...f,
      sponsors: f.sponsors.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }
  function removeSponsor(id: string) {
    setFile((f) => ({ ...f, sponsors: f.sponsors.filter((s) => s.id !== id) }));
  }
  function addSponsor() {
    setFile((f) => ({ ...f, sponsors: [...f.sponsors, newSponsor()] }));
  }

  async function handleSave() {
    for (const s of file.sponsors) {
      if (!s.name.trim()) return toast.error("Each sponsor needs a name");
      if (!s.url.trim() || !/^https?:\/\//i.test(s.url))
        return toast.error(`Sponsor "${s.name || "?"}" needs a valid URL`);
    }
    setSaving(true);
    try {
      await save({ data: { password: pw, file } });
      toast.success("Sponsors saved to GitHub");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Toaster richColors position="top-right" />
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Admin access</h1>
          </div>
          <Label htmlFor="pw" className="text-xs">
            Admin password
          </Label>
          <Input
            id="pw"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            required
            className="mt-1"
          />
          <Button type="submit" disabled={checking} className="mt-4 w-full">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enter"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Sponsors admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void hydrate()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Reload"
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Rotation</h2>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:w-auto">
              <Label htmlFor="rotation" className="text-xs">
                Switch every (seconds)
              </Label>
              <Input
                id="rotation"
                type="number"
                min={3}
                max={3600}
                value={file.rotationSeconds}
                onChange={(e) =>
                  setFile((f) => ({
                    ...f,
                    rotationSeconds: Math.max(
                      3,
                      Math.min(3600, Number(e.target.value) || 20),
                    ),
                  }))
                }
                className="mt-1 w-full sm:w-32"
              />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">
              Applies when 2+ sponsors are active.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Sponsors ({file.sponsors.length})
            </h2>
            <Button size="sm" variant="outline" onClick={addSponsor}>
              <Plus className="mr-1 h-4 w-4" /> Add sponsor
            </Button>
          </div>

          {file.sponsors.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No sponsors yet. Click "Add sponsor".
            </p>
          ) : (
            <div className="space-y-3">
              {file.sponsors.map((s) => (
                <SponsorRow
                  key={s.id}
                  sponsor={s}
                  onChange={(p) => updateSponsor(s.id, p)}
                  onRemove={() => removeSponsor(s.id)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
            className="shadow-lg"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save to GitHub
          </Button>
        </div>
      </main>
    </div>
  );
}

function SponsorRow({
  sponsor,
  onChange,
  onRemove,
}: {
  sponsor: Sponsor;
  onChange: (patch: Partial<Sponsor>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Switch
            checked={sponsor.active}
            onCheckedChange={(v) => onChange({ active: v })}
            aria-label="Active"
          />
          <span className="truncate text-xs text-muted-foreground">
            {sponsor.active ? "Active" : "Paused"}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          className="shrink-0"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={sponsor.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Acme Inc."
          />
        </Field>
        <Field label="URL">
          <Input
            value={sponsor.url}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://example.com"
          />
        </Field>
        <Field label="Logo URL">
          <Input
            value={sponsor.logoUrl}
            onChange={(e) => onChange({ logoUrl: e.target.value })}
            placeholder="https://.../logo.png"
          />
        </Field>
        <Field label="Weight (1–10)">
          <Input
            type="number"
            min={1}
            max={10}
            value={sponsor.weight}
            onChange={(e) =>
              onChange({
                weight: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
              })
            }
          />
        </Field>
        <Field label="Tagline" className="sm:col-span-2">
          <Textarea
            rows={2}
            value={sponsor.tagline}
            onChange={(e) => onChange({ tagline: e.target.value })}
            placeholder="One-line pitch shown under the name."
          />
        </Field>
        <Field label="Schedule (optional)" className="sm:col-span-2">
          <div className="flex gap-2">
            <Input
              type="date"
              value={sponsor.startDate ?? ""}
              onChange={(e) =>
                onChange({ startDate: e.target.value || undefined })
              }
            />
            <Input
              type="date"
              value={sponsor.endDate ?? ""}
              onChange={(e) =>
                onChange({ endDate: e.target.value || undefined })
              }
            />
          </div>
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
