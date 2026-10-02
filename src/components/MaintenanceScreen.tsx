import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  History,
  Plus,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { BreakdownLog, PLANT_SHIFTS, PlantStateData } from '../types.ts';

interface MaintenanceScreenProps {
  data: PlantStateData;
  onLogBreakdown: (payload: any) => Promise<void>;
  onUpdateBreakdownStatus: (id: number, status: string, actionTaken: string) => Promise<void>;
  onLogDailyMaintenance: (payload: any) => Promise<void>;
  onCreatePreventiveSchedule: (payload: any) => Promise<void>;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  data,
  onLogBreakdown,
  onUpdateBreakdownStatus,
  onLogDailyMaintenance,
  onCreatePreventiveSchedule,
}) => {
  const [subTab, setSubTab] = useState<'breakdowns' | 'daily' | 'preventive' | 'history'>(
    'breakdowns'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED' | 'CRITICAL'>('ALL');
  const [printWorkOrder, setPrintWorkOrder] = useState<BreakdownLog | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [bdForm, setBdForm] = useState({
    ticketCode: `BD-${new Date().getFullYear()}-${String(data.breakdownLogs.length + 1).padStart(3, '0')}`,
    machineId: data.machines[0]?.id || 0,
    sectionId: data.sections[0]?.id || 0,
    severity: 'Critical',
    failureMode: '',
    rootCause: '',
    assignedTechnician: '',
    downtimeMinutes: 0,
  });

  const [dmForm, setDmForm] = useState({
    machineId: data.machines[0]?.id || 0,
    checklistTitle: '',
    shift: PLANT_SHIFTS[0],
    operatorName: '',
    lubricationOk: true,
    pressureBar: '',
    temperatureCelsius: '',
    vibrationMmS: '',
    remarks: '',
    status: 'Completed',
  });

  const [pmForm, setPmForm] = useState({
    scheduleCode: `PM-${new Date().getFullYear()}-${String(data.preventiveSchedules.length + 1).padStart(3, '0')}`,
    machineId: data.machines[0]?.id || 0,
    title: '',
    frequency: 'Monthly',
    assignedEngineer: '',
    nextDueDate: new Date().toISOString().slice(0, 10),
    estimatedHours: 4,
  });

  const getMachineLabel = (id: number) => {
    const m = data.machines.find((x) => x.id === id);
    return m ? `${m.code} — ${m.name}` : `Machine #${id}`;
  };

  const q = searchQuery.trim().toLowerCase();

  const filteredBreakdowns = useMemo(() => {
    return data.breakdownLogs.filter((bd) => {
      const mLabel = getMachineLabel(bd.machineId).toLowerCase();
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'OPEN'
          ? bd.status !== 'Resolved'
          : statusFilter === 'RESOLVED'
          ? bd.status === 'Resolved'
          : bd.severity === 'Critical';
      const matchesSearch =
        !q ||
        bd.ticketCode.toLowerCase().includes(q) ||
        mLabel.includes(q) ||
        bd.failureMode.toLowerCase().includes(q) ||
        bd.assignedTechnician.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [data.breakdownLogs, data.machines, q, statusFilter]);

  const filteredDaily = useMemo(() => {
    if (!q) return data.dailyMaintenance;
    return data.dailyMaintenance.filter(
      (dm) =>
        getMachineLabel(dm.machineId).toLowerCase().includes(q) ||
        dm.checklistTitle.toLowerCase().includes(q) ||
        dm.operatorName.toLowerCase().includes(q) ||
        dm.shift.toLowerCase().includes(q)
    );
  }, [data.dailyMaintenance, data.machines, q]);

  const filteredPreventive = useMemo(() => {
    if (!q) return data.preventiveSchedules;
    return data.preventiveSchedules.filter(
      (pm) =>
        pm.scheduleCode.toLowerCase().includes(q) ||
        getMachineLabel(pm.machineId).toLowerCase().includes(q) ||
        pm.title.toLowerCase().includes(q) ||
        pm.assignedEngineer.toLowerCase().includes(q)
    );
  }, [data.preventiveSchedules, data.machines, q]);

  const filteredHistory = useMemo(() => {
    if (!q) return data.machineHistory;
    return data.machineHistory.filter(
      (mh) =>
        getMachineLabel(mh.machineId).toLowerCase().includes(q) ||
        mh.eventType.toLowerCase().includes(q) ||
        mh.summary.toLowerCase().includes(q) ||
        mh.partsReplaced.toLowerCase().includes(q)
    );
  }, [data.machineHistory, data.machines, q]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (subTab === 'breakdowns') {
        await onLogBreakdown({
          ...bdForm,
          machineId: Number(bdForm.machineId),
          sectionId: Number(bdForm.sectionId),
          downtimeMinutes: Number(bdForm.downtimeMinutes),
        });
      } else if (subTab === 'daily') {
        await onLogDailyMaintenance({
          ...dmForm,
          machineId: Number(dmForm.machineId),
        });
      } else if (subTab === 'preventive') {
        await onCreatePreventiveSchedule({
          ...pmForm,
          machineId: Number(pmForm.machineId),
          estimatedHours: Number(pmForm.estimatedHours),
        });
      }
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar & Search/Filter Controls */}
      <div className="cmms-card rounded-md p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              id: 'breakdowns',
              label: 'Breakdown Logs',
              count: data.breakdownLogs.length,
              icon: Flame,
            },
            {
              id: 'daily',
              label: 'Daily Maintenance',
              count: data.dailyMaintenance.length,
              icon: ClipboardCheck,
            },
            {
              id: 'preventive',
              label: 'Preventive Schedules',
              count: data.preventiveSchedules.length,
              icon: CalendarClock,
            },
            {
              id: 'history',
              label: 'Machine History',
              count: data.machineHistory.length,
              icon: History,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded text-xs font-semibold transition-colors border ${
                  active
                    ? 'cmms-badge-info'
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                <span>{tab.label}</span>
                <span className="font-mono-tech text-[11px] px-1.5 py-0.2 bg-[var(--bg-secondary)] rounded text-[var(--accent-text)]">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {subTab === 'breakdowns' && (
            <div className="flex items-center gap-1">
              {(['ALL', 'OPEN', 'CRITICAL', 'RESOLVED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1.5 rounded text-[11px] font-mono-tech font-semibold border transition-colors ${
                    statusFilter === st
                      ? 'cmms-badge-info'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          )}

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticket, machine, tech..."
              className="w-full cmms-input rounded pl-8 pr-7 py-1.5 text-xs placeholder-[var(--text-muted)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {subTab !== 'history' && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>
                {subTab === 'breakdowns'
                  ? 'Log Breakdown'
                  : subTab === 'daily'
                  ? 'Record Daily Check'
                  : 'Schedule PM Task'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Content Tables */}
      <div className="cmms-card rounded-md overflow-hidden">
        {subTab === 'breakdowns' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Machine</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Failure Mode & Root Cause</th>
                  <th className="py-3 px-4 text-right">Downtime</th>
                  <th className="py-3 px-4">Assigned Tech</th>
                  <th className="py-3 px-4">Status / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredBreakdowns.length > 0 ? (
                  filteredBreakdowns.map((bd) => (
                    <tr key={bd.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                        {bd.ticketCode}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                        {getMachineLabel(bd.machineId)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                            bd.severity === 'Critical' ? 'cmms-badge-critical' : 'cmms-badge-warning'
                          }`}
                        >
                          {bd.severity === 'Critical' && bd.status !== 'Resolved' && (
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                          )}
                          {bd.severity}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <div className="text-[var(--text-primary)] font-medium">
                          {bd.failureMode}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Cause: {bd.rootCause}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-primary)]">
                        {bd.downtimeMinutes} min
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {bd.assignedTechnician}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                              bd.status === 'Resolved'
                                ? 'cmms-badge-success'
                                : 'cmms-badge-critical'
                            }`}
                          >
                            {bd.status}
                          </span>
                          {bd.status !== 'Resolved' && (
                            <button
                              onClick={() =>
                                onUpdateBreakdownStatus(
                                  bd.id,
                                  'Resolved',
                                  'Replaced faulty assembly, tested under full load, restored to production.'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold no-print"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Resolve
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPrintWorkOrder(bd)}
                            title="Print Work Order Slip"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-[11px] font-mono-tech text-[var(--text-secondary)] hover:text-[var(--text-primary)] no-print"
                          >
                            <Printer className="w-3 h-3" /> Slip
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 px-4 text-center text-xs text-[var(--text-secondary)]"
                    >
                      No breakdown logs match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'daily' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Machine</th>
                  <th className="py-3 px-4">Checklist Title</th>
                  <th className="py-3 px-4">Shift / Operator</th>
                  <th className="py-3 px-4">Pressure / Temp / Vib</th>
                  <th className="py-3 px-4">Remarks</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredDaily.map((dm) => (
                  <tr key={dm.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {getMachineLabel(dm.machineId)}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">{dm.checklistTitle}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {dm.shift} &bull; {dm.operatorName}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--accent-text)]">
                      {dm.pressureBar} | {dm.temperatureCelsius} | {dm.vibrationMmS}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{dm.remarks}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                          dm.status === 'Completed' ? 'cmms-badge-success' : 'cmms-badge-warning'
                        }`}
                      >
                        {dm.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'preventive' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Schedule Code</th>
                  <th className="py-3 px-4">Machine</th>
                  <th className="py-3 px-4">PM Task Title</th>
                  <th className="py-3 px-4">Frequency</th>
                  <th className="py-3 px-4">Next Due</th>
                  <th className="py-3 px-4">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredPreventive.map((pm) => (
                  <tr key={pm.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {pm.scheduleCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {getMachineLabel(pm.machineId)}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">{pm.title}</td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {pm.frequency}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-primary)]">
                      {pm.nextDueDate}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                          pm.complianceStatus === 'Overdue'
                            ? 'cmms-badge-critical'
                            : pm.complianceStatus === 'Due Soon'
                            ? 'cmms-badge-warning'
                            : 'cmms-badge-info'
                        }`}
                      >
                        {pm.complianceStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'history' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Event Date</th>
                  <th className="py-3 px-4">Machine</th>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Technical Summary</th>
                  <th className="py-3 px-4">Parts Replaced</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredHistory.map((mh) => (
                  <tr key={mh.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {mh.eventDate}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {getMachineLabel(mh.machineId)}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--accent-text)]">
                      {mh.eventType}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">{mh.summary}</td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {mh.partsReplaced}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-primary)]">
                      ${mh.costIncurred.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Work Order Slip Modal */}
      {printWorkOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div>
                <div className="text-[10px] font-mono-tech uppercase text-[var(--accent-text)]">
                  MAINTEX OFFICIAL MAINTENANCE WORK ORDER
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                  Ticket #{printWorkOrder.ticketCode}
                </h3>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPrintWorkOrder(null)}
                  className="px-2.5 py-1.5 rounded bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-4">
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">Machine</div>
                <div className="font-semibold text-[var(--text-primary)] mt-0.5">
                  {getMachineLabel(printWorkOrder.machineId)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Severity & Status
                </div>
                <div className="font-mono-tech font-bold text-[var(--accent-text)] mt-0.5">
                  {printWorkOrder.severity} &bull; {printWorkOrder.status}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Assigned Technician
                </div>
                <div className="font-medium text-[var(--text-primary)] mt-0.5">
                  {printWorkOrder.assignedTechnician || 'Duty Engineer'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Recorded Downtime
                </div>
                <div className="font-mono-tech font-semibold text-[var(--text-primary)] mt-0.5">
                  {printWorkOrder.downtimeMinutes} Minutes
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Failure Mode Description
                </div>
                <div className="font-medium text-[var(--text-primary)] mt-1">
                  {printWorkOrder.failureMode}
                </div>
              </div>
              <div className="p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-color)]">
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Root Cause & Corrective Action
                </div>
                <div className="text-[var(--text-primary)] mt-1">
                  {printWorkOrder.rootCause || 'Standard mechanical/electrical inspection'} &mdash;{' '}
                  {printWorkOrder.actionTaken || 'Pending technician completion sign-off.'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-8 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
              <div className="border-t border-dashed border-[var(--border-color)] pt-2 text-center">
                Maintenance Engineer Signature
              </div>
              <div className="border-t border-dashed border-[var(--border-color)] pt-2 text-center">
                Plant Supervisor Verification
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                {subTab === 'breakdowns'
                  ? 'Log Emergency Machine Breakdown'
                  : subTab === 'daily'
                  ? 'Record Shift Daily Maintenance Check'
                  : 'Create Preventive Maintenance Schedule'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              {subTab === 'breakdowns' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Ticket Code</label>
                      <input
                        required
                        value={bdForm.ticketCode}
                        onChange={(e) => setBdForm({ ...bdForm, ticketCode: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Severity</label>
                      <select
                        value={bdForm.severity}
                        onChange={(e) => setBdForm({ ...bdForm, severity: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2"
                      >
                        <option value="Critical">Critical</option>
                        <option value="Major">Major</option>
                        <option value="Minor">Minor</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Machine</label>
                    <select
                      value={bdForm.machineId}
                      onChange={(e) =>
                        setBdForm({ ...bdForm, machineId: Number(e.target.value) })
                      }
                      className="w-full cmms-input rounded px-3 py-2"
                    >
                      {data.machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code} — {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">
                      Failure Mode Description
                    </label>
                    <input
                      required
                      value={bdForm.failureMode}
                      onChange={(e) => setBdForm({ ...bdForm, failureMode: e.target.value })}
                      placeholder="Spindle Drive Overcurrent Fault F3001"
                      className="w-full cmms-input rounded px-3 py-2"
                    />
                  </div>
                </>
              )}

              {subTab === 'daily' && (
                <>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Machine</label>
                    <select
                      value={dmForm.machineId}
                      onChange={(e) =>
                        setDmForm({ ...dmForm, machineId: Number(e.target.value) })
                      }
                      className="w-full cmms-input rounded px-3 py-2"
                    >
                      {data.machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code} — {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Inspection Title
                      </label>
                      <input
                        required
                        value={dmForm.checklistTitle}
                        onChange={(e) => setDmForm({ ...dmForm, checklistTitle: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Duty Shift (12-Hr Schedule)
                      </label>
                      <select
                        value={dmForm.shift}
                        onChange={(e) => setDmForm({ ...dmForm, shift: e.target.value as any })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      >
                        {PLANT_SHIFTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Pressure</label>
                      <input
                        value={dmForm.pressureBar}
                        onChange={(e) => setDmForm({ ...dmForm, pressureBar: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Temperature</label>
                      <input
                        value={dmForm.temperatureCelsius}
                        onChange={(e) =>
                          setDmForm({ ...dmForm, temperatureCelsius: e.target.value })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Vibration</label>
                      <input
                        value={dmForm.vibrationMmS}
                        onChange={(e) => setDmForm({ ...dmForm, vibrationMmS: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                  </div>
                </>
              )}

              {subTab === 'preventive' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Schedule Code
                      </label>
                      <input
                        required
                        value={pmForm.scheduleCode}
                        onChange={(e) => setPmForm({ ...pmForm, scheduleCode: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Next Due Date
                      </label>
                      <input
                        type="date"
                        required
                        value={pmForm.nextDueDate}
                        onChange={(e) => setPmForm({ ...pmForm, nextDueDate: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Machine</label>
                    <select
                      value={pmForm.machineId}
                      onChange={(e) =>
                        setPmForm({ ...pmForm, machineId: Number(e.target.value) })
                      }
                      className="w-full cmms-input rounded px-3 py-2"
                    >
                      {data.machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code} — {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">PM Task Title</label>
                    <input
                      required
                      value={pmForm.title}
                      onChange={(e) => setPmForm({ ...pmForm, title: e.target.value })}
                      placeholder="500-Hr Ball Screw Backlash & Servo Tuning Check"
                      className="w-full cmms-input rounded px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold"
                >
                  {submitting ? 'Syncing...' : 'Commit Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
