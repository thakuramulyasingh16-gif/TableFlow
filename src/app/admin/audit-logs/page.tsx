'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge, Button, Card, Skeleton, Toast } from '@/components/ui';

interface AuditLogEntry {
  id: string;
  actorUserId?: number | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: number;
    name: string;
    email: string;
  } | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Filters
  const [searchAction, setSearchAction] = useState('');
  const [searchActor, setSearchActor] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Enforce Owner-only access
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/admin/audit-logs');
    } else if (status === 'authenticated' && user?.role !== 'owner') {
      router.push('/admin');
    }
  }, [status, user?.role, router]);

  const fetchLogs = useCallback(
    async (pageToLoad: number, showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          page: String(pageToLoad),
          limit: '25',
        });

        if (searchAction.trim()) queryParams.set('action', searchAction.trim());
        if (searchActor.trim()) queryParams.set('actor', searchActor.trim());
        if (filterRole) queryParams.set('role', filterRole);
        if (filterEntityType.trim()) queryParams.set('entityType', filterEntityType.trim());
        if (filterFrom) queryParams.set('from', new Date(filterFrom).toISOString());
        if (filterTo) queryParams.set('to', new Date(filterTo).toISOString());

        const res = await apiFetch<{ logs: AuditLogEntry[]; pagination: PaginationMeta }>(
          `/api/admin/audit-logs?${queryParams.toString()}`
        );

        setLogs(res.logs || []);
        setPagination(res.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 });
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to fetch audit logs');
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [searchAction, searchActor, filterRole, filterEntityType, filterFrom, filterTo]
  );

  useEffect(() => {
    let active = true;
    if (status === 'authenticated' && user?.role === 'owner') {
      const run = async () => {
        try {
          const queryParams = new URLSearchParams({
            page: '1',
            limit: '25',
          });

          if (searchAction.trim()) queryParams.set('action', searchAction.trim());
          if (searchActor.trim()) queryParams.set('actor', searchActor.trim());
          if (filterRole) queryParams.set('role', filterRole);
          if (filterEntityType.trim()) queryParams.set('entityType', filterEntityType.trim());
          if (filterFrom) queryParams.set('from', new Date(filterFrom).toISOString());
          if (filterTo) queryParams.set('to', new Date(filterTo).toISOString());

          const res = await apiFetch<{ logs: AuditLogEntry[]; pagination: PaginationMeta }>(
            `/api/admin/audit-logs?${queryParams.toString()}`
          );

          if (active) {
            setLogs(res.logs || []);
            setPagination(res.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 });
            setLoading(false);
          }
        } catch (err) {
          if (active) {
            setToast(err instanceof Error ? err.message : 'Failed to fetch audit logs');
            setLoading(false);
          }
        }
      };
      run();
    }
    return () => {
      active = false;
    };
  }, [status, user?.role, searchAction, searchActor, filterRole, filterEntityType, filterFrom, filterTo]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleResetFilters() {
    setSearchAction('');
    setSearchActor('');
    setFilterRole('');
    setFilterEntityType('');
    setFilterFrom('');
    setFilterTo('');
  }

  function getActionBadgeTone(action: string): 'tomato' | 'leaf' | 'sun' | 'mint' {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('DEMOTE') || act.includes('DEACTIVATE') || act.includes('REVOKE')) {
      return 'tomato';
    }
    if (act.includes('CREATE') || act.includes('CONFIRM') || act.includes('CAPTURE') || act.includes('OPEN')) {
      return 'leaf';
    }
    if (act.includes('UPDATE') || act.includes('TOGGLE') || act.includes('PIN') || act.includes('OVERRIDE')) {
      return 'sun';
    }
    return 'mint';
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-cream p-8 flex items-center justify-center">
        <Skeleton className="h-12 w-64 rounded-2xl" />
      </div>
    );
  }

  if (user?.role !== 'owner') {
    return null;
  }

  return (
    <div className="min-h-screen bg-cream font-sans pb-16">
      {toast && <Toast message={toast} />}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-sun/30 shadow-soft">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2.5 rounded-xl bg-surface hover:bg-mint-bg text-leaf transition border border-leaf/20 flex items-center gap-1.5 text-[13px] font-extrabold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Admin</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-leaf" />
                <h1 className="text-[20px] font-extrabold text-ink tracking-tight">Audit Logs & Compliance</h1>
                <Badge tone="leaf">Owner Only</Badge>
              </div>
              <p className="text-[12px] font-medium text-muted">
                Immutable security logs, access events, financial audits, and state transitions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="mint"
              onClick={() => fetchLogs(pagination.page, true)}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        {/* Filters Card */}
        <Card className="p-5 border-sun/30 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-sun/20 pb-2.5">
            <div className="flex items-center gap-2 text-ink font-extrabold text-[14px]">
              <Filter className="w-4 h-4 text-leaf" />
              <span>Filter Audit Trail</span>
            </div>
            <button
              onClick={handleResetFilters}
              className="text-[12px] font-bold text-muted hover:text-tomato transition underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* Action Search */}
            <div>
              <label className="block text-[11px] font-extrabold text-muted uppercase tracking-wider mb-1">
                Action
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. PAYMENT, DELETE"
                  value={searchAction}
                  onChange={(e) => setSearchAction(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-[12px] rounded-xl border border-sun/40 bg-surface/50 text-ink focus:outline-none focus:ring-2 focus:ring-sun font-medium"
                />
              </div>
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-[11px] font-extrabold text-muted uppercase tracking-wider mb-1">
                Entity Type
              </label>
              <input
                type="text"
                placeholder="e.g. payment, order, staff"
                value={filterEntityType}
                onChange={(e) => setFilterEntityType(e.target.value)}
                className="w-full px-3 py-2 text-[12px] rounded-xl border border-sun/40 bg-surface/50 text-ink focus:outline-none focus:ring-2 focus:ring-sun font-medium"
              />
            </div>

            {/* Role Filter */}
            <div>
              <label className="block text-[11px] font-extrabold text-muted uppercase tracking-wider mb-1">
                Actor Role
              </label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-full px-3 py-2 text-[12px] rounded-xl border border-sun/40 bg-surface/50 text-ink focus:outline-none focus:ring-2 focus:ring-sun font-medium"
              >
                <option value="">All Roles</option>
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="waiter">Waiter</option>
                <option value="chef">Chef</option>
                <option value="system">System / Internal</option>
              </select>
            </div>

            {/* Actor Search */}
            <div>
              <label className="block text-[11px] font-extrabold text-muted uppercase tracking-wider mb-1">
                Actor Name / Email
              </label>
              <input
                type="text"
                placeholder="Search staff..."
                value={searchActor}
                onChange={(e) => setSearchActor(e.target.value)}
                className="w-full px-3 py-2 text-[12px] rounded-xl border border-sun/40 bg-surface/50 text-ink focus:outline-none focus:ring-2 focus:ring-sun font-medium"
              />
            </div>

            {/* Date From */}
            <div>
              <label className="block text-[11px] font-extrabold text-muted uppercase tracking-wider mb-1">
                From Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 text-[12px] rounded-xl border border-sun/40 bg-surface/50 text-ink focus:outline-none focus:ring-2 focus:ring-sun font-medium"
                />
              </div>
            </div>

            {/* Date To */}
            <div>
              <label className="block text-[11px] font-extrabold text-muted uppercase tracking-wider mb-1">
                To Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 text-[12px] rounded-xl border border-sun/40 bg-surface/50 text-ink focus:outline-none focus:ring-2 focus:ring-sun font-medium"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Logs Table */}
        <Card className="overflow-hidden border-sun/30">
          <div className="p-4 bg-surface/60 border-b border-sun/20 flex items-center justify-between text-[13px] font-bold text-ink">
            <span>
              Showing {logs.length} of {pagination.total} audit records
            </span>
            <span className="text-[12px] text-muted font-normal">Page {pagination.page} of {pagination.totalPages}</span>
          </div>

          {loading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <ShieldAlert className="w-10 h-10 text-muted mx-auto" />
              <p className="text-[15px] font-bold text-ink">No audit logs found</p>
              <p className="text-[13px] text-muted">Try clearing or relaxing your filter criteria</p>
            </div>
          ) : (
            <div className="divide-y divide-sun/20">
              {logs.map((log) => {
                const isExpanded = expandedIds.has(log.id);
                return (
                  <div key={log.id} className="p-4 hover:bg-surface/30 transition space-y-2">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <Badge tone={getActionBadgeTone(log.action)}>{log.action}</Badge>
                        <span className="text-[13px] font-bold text-ink">{log.entityType}</span>
                        {log.entityId && (
                          <span className="text-[12px] px-2 py-0.5 rounded bg-sun-soft/40 text-ink font-mono">
                            #{log.entityId}
                          </span>
                        )}
                        <span className="text-[11px] text-muted font-medium">
                          {new Date(log.createdAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'medium',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[12px]">
                        <div className="text-right">
                          <span className="font-bold text-ink">
                            {log.actor?.name || (log.actorRole ? `${log.actorRole}` : 'System')}
                          </span>
                          {log.actor?.email && (
                            <span className="text-[11px] text-muted block">{log.actor.email}</span>
                          )}
                        </div>
                        {log.actorRole && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-mint-bg text-leaf">
                            {log.actorRole}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata details toggle */}
                    <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                      <div className="flex items-center gap-3">
                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                        {log.userAgent && <span className="truncate max-w-xs">{log.userAgent}</span>}
                      </div>

                      {log.metadataJson && Object.keys(log.metadataJson).length > 0 && (
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="font-bold text-leaf hover:underline cursor-pointer"
                        >
                          {isExpanded ? 'Hide Payload' : 'View Payload JSON'}
                        </button>
                      )}
                    </div>

                    {isExpanded && log.metadataJson && (
                      <pre className="p-3 bg-ink/5 rounded-xl text-[11px] font-mono text-ink overflow-x-auto border border-sun/20 max-h-48">
                        {JSON.stringify(log.metadataJson, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-4 bg-surface/40 border-t border-sun/20 flex items-center justify-between">
              <Button
                variant="mint"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchLogs(pagination.page - 1, true)}
                className="flex items-center gap-1 text-[12px] min-h-[38px] px-3 py-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </Button>

              <span className="text-[12px] font-bold text-ink">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <Button
                variant="mint"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchLogs(pagination.page + 1, true)}
                className="flex items-center gap-1 text-[12px] min-h-[38px] px-3 py-1.5"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
