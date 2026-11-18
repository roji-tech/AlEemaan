"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ArrowLeftIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { BranchDeleteDialog, BranchRenameDialog } from "@/components/branches/BranchDialogs";
import type { Holding } from "@/lib/branches/holdings";

type Branch = { id: string; name: string; code: string; createdAt: string };

export function BranchDetailView({ branch, holdings, onlyBranch }: { branch: Branch; holdings: Holding[]; onlyBranch: boolean }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const active = holdings.filter((h) => h.blocks);
  const setUp = holdings.filter((h) => !h.blocks);

  return (
    <div className="space-y-6">
      <Link
        href="/branches"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        All branches
      </Link>
      <PageHeader
        title={branch.name}
        description={`Code ${branch.code} · created ${new Date(branch.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              <PencilIcon className="h-4 w-4" />
              Rename
            </Button>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              <TrashIcon className="h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />
      {notice && <Alert variant="success">{notice}</Alert>}

      <Card>
        <h2 className="text-lg font-semibold text-fg">What this branch holds</h2>
        {holdings.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Nothing yet: no people, classes, records or settings.</p>
        ) : (
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <HoldingList title="People and records" items={active} empty="None." />
            <HoldingList title="Set-up" items={setUp} empty="None." />
          </div>
        )}
        <p className="mt-4 text-sm text-fg-muted">
          {onlyBranch
            ? "This is the school's only branch, so it cannot be deleted."
            : active.length > 0
              ? "A branch with people or records in it cannot be deleted. Move or remove them first."
              : "This branch holds no people or records, so it can be deleted."}
        </p>
      </Card>

      <BranchRenameDialog
        branch={branch}
        code={branch.code}
        open={renaming}
        onClose={() => setRenaming(false)}
        onSaved={(name) => {
          setRenaming(false);
          setNotice(`The branch is now called “${name}”.`);
          router.refresh();
        }}
      />
      <BranchDeleteDialog
        branch={branch}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={(name) => {
          setDeleting(false);
          router.replace(`/branches?deleted=${encodeURIComponent(name)}`);
        }}
      />
    </div>
  );
}

function HoldingList({ title, items, empty }: { title: string; items: Holding[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-fg-2">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-fg">
          {items.map((h) => (
            <li key={h.label}>
              <span className="font-semibold tabular-nums">{h.count}</span> {h.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
