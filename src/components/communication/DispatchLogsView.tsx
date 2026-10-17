"use client";

import { useState, useEffect, useCallback } from "react";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { SpinnerIcon } from "@/components/ui/icons";

export interface DispatchLogsViewProps {
  branchId: string;
}

interface DispatchItem {
  id: string;
  channel: NotificationChannel;
  recipientAddress: string;
  status: NotificationDispatchStatus;
  subject: string | null;
  body: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export function DispatchLogsView({ branchId }: DispatchLogsViewProps) {
  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [inspectItem, setInspectItem] = useState<DispatchItem | null>(null);

  const fetchDispatches = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        branchId,
        page: String(page),
        limit: "15",
      });
      if (channelFilter !== "ALL") params.set("channel", channelFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/v1/communication/dispatches?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setDispatches(json.data?.items || []);
        setTotal(json.data?.total || 0);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [branchId, page, channelFilter, statusFilter, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch initial data on mount/filter change
    void fetchDispatches();
  }, [fetchDispatches]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/v1/communication/dispatches/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      if (res.ok) {
        void fetchDispatches();
      }
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: NotificationDispatchStatus) => {
    switch (status) {
      case "SENT":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700";
      case "FAILED":
        return "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-700";
      case "PROCESSING":
      case "RETRYING":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700";
      case "QUEUED":
      default:
        return "bg-secondary text-secondary-foreground border-border";
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border p-4 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient or content..."
            className="w-full sm:w-64 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            aria-label="Filter by channel"
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium focus:border-primary focus:outline-none"
          >
            <option value="ALL">All Channels</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="IN_APP">In-App</option>
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium focus:border-primary focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="QUEUED">Queued</option>
            <option value="RETRYING">Retrying</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void fetchDispatches()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          {loading && <SpinnerIcon className="animate-spin h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Dispatches Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Dispatches table"
        className="overflow-x-auto bg-card border border-border rounded-xl shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground font-semibold">
            <tr>
              <th scope="col" className="px-4 py-3">Recipient</th>
              <th scope="col" className="px-4 py-3">Channel</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Attempts</th>
              <th scope="col" className="px-4 py-3">Sent / Dispatched</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dispatches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {loading ? "Loading dispatch logs..." : "No notification dispatches found for this filter."}
                </td>
              </tr>
            ) : (
              dispatches.map((d) => (
                <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div>{d.recipientAddress}</div>
                    {d.subject && <div className="text-xs text-muted-foreground truncate max-w-xs">{d.subject}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.channel}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded border ${getStatusBadge(d.status)}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.attempts}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {d.sentAt ? new Date(d.sentAt).toLocaleString() : new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setInspectItem(d)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View
                    </button>
                    {d.status === "FAILED" && (
                      <button
                        type="button"
                        onClick={() => void handleRetry(d.id)}
                        disabled={retryingId === d.id}
                        className="inline-flex items-center text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-50"
                      >
                        {retryingId === d.id && <SpinnerIcon className="animate-spin h-3 w-3 mr-1" />}
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination summary */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
        <span>Total: {total} logs</span>
        <div className="space-x-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2.5 py-1 rounded border border-border bg-background disabled:opacity-50"
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            disabled={page * 15 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-2.5 py-1 rounded border border-border bg-background disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Inspect Modal */}
      {inspectItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-semibold text-foreground">Dispatch Details</h3>
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="font-semibold text-muted-foreground">Recipient:</span>{" "}
                <span className="text-foreground">{inspectItem.recipientAddress}</span>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">Channel:</span>{" "}
                <span className="text-foreground">{inspectItem.channel}</span>
              </div>
              {inspectItem.subject && (
                <div>
                  <span className="font-semibold text-muted-foreground">Subject:</span>{" "}
                  <span className="text-foreground">{inspectItem.subject}</span>
                </div>
              )}
              <div>
                <span className="font-semibold text-muted-foreground">Content:</span>
                <p className="mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap text-foreground font-mono text-xs">
                  {inspectItem.body}
                </p>
              </div>
              {inspectItem.lastError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-900 dark:text-red-200">
                  <span className="font-semibold">Error Message:</span> {inspectItem.lastError}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
