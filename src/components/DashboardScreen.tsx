import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Flame,
  Gauge,
  Package,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { NavSectionId, PlantStateData } from '../types.ts';

interface DashboardScreenProps {
  data: PlantStateData;
  onNavigate: (section: NavSectionId) => void;
}

const WORKFLOW_STAGES = [
  { key: 'New', step: '01', label: 'NEW' },
  { key: 'Assigned', step: '02', label: 'ASSIGNED' },
  { key: 'Work Progress', step: '03', label: 'WORK PROGRESS' },
  { key: 'Production Verification', step: '04', label: 'PRODUCTION VERIFICATION' },
] as const;

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ data, onNavigate }) => {
  const [fleetSearch, setFleetSearch] = useState('');
  const [fleetStatusFilter, setFleetStatusFilter] = useState<string>('ALL');

  const openBreakdowns = data.breakdownLogs.filter((b) => b.status !== 'Resolved');
  const criticalBreakdownsCount = openBreakdowns.filter((b) => b.severity === 'Critical').length;
  const activeLowStock = data.lowStockAlerts.filter((a) => a.alertStatus !== 'Resolved');
  const pendingRequisitions = data.requisitions.filter((r) => r.status === 'Pending Approval');
  const activePOsCount = data.purchaseHistory.filter(
    (p) => p.deliveryStatus !== 'Delivered'
  ).length;

  const totalMachinesCount = Math.max(data.machines.length, 1);
  const onlineMachinesCount = data.machines.filter((m) => m.status === 'Running').length;
  const avgHealth =
    data.machines.length > 0
      ? Math.round(data.machines.reduce((acc, m) => acc + m.healthScore, 0) / data.machines.length)
      : 100;

  const filteredFleet = useMemo(() => {
    const q = fleetSearch.trim().toLowerCase();
    return data.machines.filter((m) => {
      const matchesStatus = fleetStatusFilter === 'ALL' || m.status === fleetStatusFilter;
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.manufacturer.toLowerCase().includes(q) ||
        m.modelNumber.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [data.machines, fleetSearch, fleetStatusFilter]);

  const getMachineName = (id: number) =>
    data.machines.find((m) => m.id === id)?.name || `Machine #${id}`;
  const getMachineCode = (id: number) =>
    data.machines.find((m) => m.id === id)?.code || `MCH-${id}`;
  const getPartName = (id: number) =>
    data.spareParts.find((p) => p.id === id)?.name || `Part #${id}`;
  const getPartNumber = (id: number) =>
    data.spareParts.find((p) => p.id === id)?.partNumber || `SP-${id}`;

  // Circular SVG OEE ring math
  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (avgHealth / 100) * ringCircumference;

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. KPI SUMMARY GRID (4 Primary Enterprise Cards)
         ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* Card 1: Open Breakdowns */}
        <div
          onClick={() => onNavigate('maintenance')}
          className="cursor-pointer cmms-card p-6 hover:border-red-400 transition-all duration-150 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Open Breakdowns
            </span>
            <div className="w-9 h-9 rounded-lg cmms-badge-critical flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[32px] leading-none font-bold tracking-tight font-mono-tech text-[var(--text-primary)]">
              {openBreakdowns.length}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-tech font-semibold px-2.5 py-1 rounded-md cmms-badge-critical">
              {criticalBreakdownsCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              )}
              {criticalBreakdownsCount} CRITICAL
            </span>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Active floor downtime</span>
            <span className="font-mono-tech font-semibold text-[var(--text-primary)]">
              {openBreakdowns.reduce((sum, b) => sum + b.downtimeMinutes, 0)} min
            </span>
          </div>
        </div>

        {/* Card 2: Low Stock Items */}
        <div
          onClick={() => onNavigate('store')}
          className="cursor-pointer cmms-card p-6 hover:border-amber-400 transition-all duration-150 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Low Stock Items
            </span>
            <div className="w-9 h-9 rounded-lg cmms-badge-warning flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[32px] leading-none font-bold tracking-tight font-mono-tech text-[var(--text-primary)]">
              {activeLowStock.length}
            </span>
            <span className="text-[11px] font-mono-tech font-semibold px-2.5 py-1 rounded-md cmms-badge-warning">
              BELOW MIN THRESHOLD
            </span>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Cataloged MRO SKUs</span>
            <span className="font-mono-tech font-semibold text-[var(--text-primary)]">
              {data.spareParts.length} Items
            </span>
          </div>
        </div>

        {/* Card 3: Pending Requisitions */}
        <div
          onClick={() => onNavigate('procurement')}
          className="cursor-pointer cmms-card p-6 hover:border-[#2563EB] transition-all duration-150 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Pending Requisitions
            </span>
            <div className="w-9 h-9 rounded-lg cmms-badge-info flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[32px] leading-none font-bold tracking-tight font-mono-tech text-[var(--text-primary)]">
              {pendingRequisitions.length}
            </span>
            <span className="text-[11px] font-mono-tech font-semibold px-2.5 py-1 rounded-md cmms-badge-info">
              {activePOsCount} Active POs
            </span>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Estimated PR value</span>
            <span className="font-mono-tech font-semibold text-[var(--text-primary)]">
              $
              {pendingRequisitions
                .reduce((sum, r) => sum + r.estimatedTotalCost, 0)
                .toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 4: Plant OEE & Health Index */}
        <div
          onClick={() => onNavigate('assets')}
          className="cursor-pointer cmms-card p-6 hover:border-emerald-400 transition-all duration-150 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Plant OEE &amp; Health Index
            </span>
            {/* Progress Ring Indicator */}
            <div className="relative w-11 h-11 flex items-center justify-center">
              <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke="var(--border-color)"
                  strokeWidth="4"
                />
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <Gauge className="w-4 h-4 text-emerald-600 absolute" />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[32px] leading-none font-bold tracking-tight font-mono-tech text-[var(--text-primary)]">
              {avgHealth}%
            </span>
            <span className="text-[11px] font-mono-tech font-semibold px-2.5 py-1 rounded-md cmms-badge-success">
              {onlineMachinesCount}/{totalMachinesCount} ONLINE
            </span>
          </div>

          <div className="mt-4 space-y-1.5">
            <div className="w-full h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${avgHealth}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Monitored plant zones</span>
              <span className="font-mono-tech font-semibold text-[var(--text-primary)]">
                {data.sections.length} Sections
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. WORKFLOW & PIPELINE SECTION (4-Stage Verification Pipeline)
         ===================================================================== */}
      <div className="cmms-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-color)]">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-heading)]">
                Shop-Floor Complaint Lifecycle Pipeline (4-Stage Verification)
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Standardized production-to-maintenance verification workflow across 4 audited stages
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('complaints')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
          >
            <span>Manage Workflow</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WORKFLOW_STAGES.map((stageObj, idx) => {
            const stageItems = data.complaints.filter((c) => c.workflowStage === stageObj.key);
            return (
              <div
                key={stageObj.key}
                className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4 flex flex-col justify-between min-h-[150px]"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border-color)]">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-[#2563EB]/10 text-[#2563EB] font-mono-tech text-xs font-bold flex items-center justify-center">
                        {stageObj.step}
                      </span>
                      <span className="text-xs font-semibold tracking-wider text-[var(--text-heading)]">
                        {stageObj.label}
                      </span>
                    </div>
                    <span
                      className={`font-mono-tech text-xs font-bold px-2 py-0.5 rounded-md ${
                        idx === 3 ? 'cmms-badge-success' : 'cmms-badge-info'
                      }`}
                    >
                      {stageItems.length}
                    </span>
                  </div>

                  {stageItems.length > 0 ? (
                    <div className="space-y-2">
                      {stageItems.slice(0, 2).map((item) => (
                        <div
                          key={item.id}
                          onClick={() => onNavigate('complaints')}
                          className="cursor-pointer p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[#2563EB] transition-colors text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-mono-tech text-[11px]">
                            <span className="font-semibold text-[#2563EB]">
                              {item.complaintCode}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                item.priority === 'Urgent'
                                  ? 'cmms-badge-critical'
                                  : 'cmms-badge-warning'
                              }`}
                            >
                              {item.priority}
                            </span>
                          </div>
                          <div className="font-semibold text-[var(--text-primary)] truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] truncate">
                            Assignee: {item.assignedTo}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-[var(--text-secondary)] font-mono-tech">
                      0 tickets in stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          3. ACTIVE DISPATCH & MRO LOW-STOCK ALERTS (2-Column Grid)
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Active Breakdown Dispatch */}
        <div className="lg:col-span-7 cmms-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Wrench className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-heading)]">
                Active Breakdown &amp; Maintenance Dispatch
              </h2>
            </div>
            <button
              onClick={() => onNavigate('maintenance')}
              className="text-xs font-semibold text-[#2563EB] hover:underline flex items-center gap-1"
            >
              Open Console <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[var(--border-color)]">
            {data.breakdownLogs.length > 0 ? (
              data.breakdownLogs.slice(0, 4).map((bd) => (
                <div
                  key={bd.id}
                  className="px-6 py-4 hover:bg-[var(--bg-secondary)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tech text-xs font-semibold px-2 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[#2563EB]">
                        {bd.ticketCode}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-mono-tech font-semibold uppercase px-2 py-0.5 rounded ${
                          bd.severity === 'Critical'
                            ? 'cmms-badge-critical'
                            : bd.severity === 'Major'
                            ? 'cmms-badge-warning'
                            : 'cmms-badge-info'
                        }`}
                      >
                        {bd.severity === 'Critical' && bd.status !== 'Resolved' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                        )}
                        {bd.severity}
                      </span>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {getMachineCode(bd.machineId)} — {getMachineName(bd.machineId)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">{bd.failureMode}</p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono-tech font-semibold text-[var(--text-primary)]">
                        {bd.downtimeMinutes}m downtime
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {bd.assignedTechnician}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-mono-tech font-semibold px-2.5 py-1 rounded-md ${
                        bd.status === 'Resolved' ? 'cmms-badge-success' : 'cmms-badge-critical'
                      }`}
                    >
                      {bd.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 px-6 text-center text-xs text-[var(--text-secondary)]">
                No active breakdown logs recorded. All production lines operating normally.
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: MRO Store Low-Stock Alerts */}
        <div className="lg:col-span-5 cmms-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-heading)]">
                MRO Store Low-Stock Alerts
              </h2>
            </div>
            <button
              onClick={() => onNavigate('store')}
              className="text-xs font-semibold text-[#2563EB] hover:underline flex items-center gap-1"
            >
              MRO Inventory <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[var(--border-color)]">
            {data.lowStockAlerts.length > 0 ? (
              data.lowStockAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className="px-6 py-4 hover:bg-[var(--bg-secondary)] transition-colors flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tech text-xs font-semibold text-[#2563EB]">
                        {getPartNumber(alert.sparePartId)}
                      </span>
                      <span
                        className={`text-[10px] font-mono-tech font-semibold uppercase px-2 py-0.5 rounded ${
                          alert.severity === 'Critical'
                            ? 'cmms-badge-critical'
                            : 'cmms-badge-warning'
                        }`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[var(--text-primary)] mt-1">
                      {getPartName(alert.sparePartId)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-tech text-xs text-[var(--text-primary)]">
                      Qty: <span className="text-red-600 font-bold">{alert.currentQty}</span> / Min:{' '}
                      {alert.thresholdQty}
                    </div>
                    <span className="text-[11px] font-mono-tech text-[var(--text-secondary)]">
                      {alert.alertStatus}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 px-6 text-center text-xs text-[var(--text-secondary)]">
                All spare parts are above minimum threshold levels.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          4. DATA TABLE (Plant Machine Fleet & Health Matrix)
         ===================================================================== */}
      <div className="cmms-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-heading)]">
              Plant Machine Fleet &amp; Health Matrix
            </h2>
            <span className="text-xs font-mono-tech font-semibold px-2.5 py-0.5 rounded-md cmms-badge-info">
              {filteredFleet.length} / {data.machines.length} Assets
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <div className="flex items-center gap-1 bg-[var(--bg-primary)] p-1 rounded-lg border border-[var(--border-color)]">
              {['ALL', 'Running', 'Breakdown', 'Under PM'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFleetStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono-tech font-semibold transition-colors ${
                    fleetStatusFilter === st
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={fleetSearch}
                onChange={(e) => setFleetSearch(e.target.value)}
                placeholder="Search asset code or machine..."
                className="w-full cmms-input pl-8 pr-7 py-1.5 text-xs placeholder-[var(--text-muted)]"
              />
              {fleetSearch && (
                <button
                  type="button"
                  onClick={() => setFleetSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-3.5 px-6">Asset Code</th>
                <th className="py-3.5 px-6">Machine Name &amp; OEM Spec</th>
                <th className="py-3.5 px-6">Criticality</th>
                <th className="py-3.5 px-6 text-right">Operating Hrs</th>
                <th className="py-3.5 px-6">Health Score</th>
                <th className="py-3.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] text-xs">
              {filteredFleet.length > 0 ? (
                filteredFleet.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-[var(--bg-secondary)]/80 transition-colors duration-100"
                  >
                    <td className="py-3.5 px-6 font-mono-tech font-semibold text-[#2563EB]">
                      {m.code}
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-[var(--text-primary)]">{m.name}</div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-mono-tech mt-0.5">
                        {m.manufacturer} &bull; {m.modelNumber} ({m.serialNumber})
                      </div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`font-mono-tech font-semibold text-[11px] px-2.5 py-1 rounded-md ${
                          m.criticality === 'Critical' ? 'cmms-badge-critical' : 'cmms-badge-info'
                        }`}
                      >
                        {m.criticality}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono-tech font-semibold text-right text-[var(--text-primary)]">
                      {m.operatingHours.toLocaleString()} hrs
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2.5">
                        <div className="w-28 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden border border-[var(--border-color)]">
                          <div
                            className={`h-full rounded-full ${
                              m.healthScore >= 85
                                ? 'bg-emerald-500'
                                : m.healthScore >= 70
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${m.healthScore}%` }}
                          />
                        </div>
                        <span className="font-mono-tech text-xs font-bold text-[var(--text-primary)]">
                          {m.healthScore}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 font-mono-tech font-semibold text-[11px] px-2.5 py-1 rounded-md ${
                          m.status === 'Running'
                            ? 'cmms-badge-success'
                            : m.status === 'Breakdown'
                            ? 'cmms-badge-critical'
                            : 'cmms-badge-warning'
                        }`}
                      >
                        {m.status === 'Breakdown' ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 px-6 text-center text-xs text-[var(--text-secondary)]"
                  >
                    No machines registered or matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
