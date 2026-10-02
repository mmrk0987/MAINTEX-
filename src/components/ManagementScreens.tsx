import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  FileText,
  Lock,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  PLANT_ROLES,
  PLANT_SHIFTS,
  PlantStateData,
  normalizeShiftLabel,
} from '../types.ts';

interface UsersScreenProps {
  data: PlantStateData;
  currentCompanyName?: string;
  currentCompanyCode?: string;
  currentRole?: string;
  onUpdateUserRole: (
    userId: number,
    role: string,
    departmentId: number | null,
    shift: string,
    rlsPolicyLevel: string
  ) => Promise<void>;
  onSwitchOwnRole?: (role: string, shift?: string) => Promise<void>;
  onCreateDepartment?: (payload: {
    code: string;
    name: string;
    headName: string;
    location: string;
  }) => Promise<void>;
}

export const UsersScreen: React.FC<UsersScreenProps> = ({
  data,
  currentCompanyName,
  currentCompanyCode,
  currentRole,
  onUpdateUserRole,
  onSwitchOwnRole,
  onCreateDepartment,
}) => {
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [roleFeedback, setRoleFeedback] = useState<string | null>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({
    code: `DEPT-0${data.departments.length + 1}`,
    name: '',
    headName: '',
    location: '',
  });

  const activeUserRole = currentRole || data.currentUser?.role || PLANT_ROLES[0];
  const activeUserShift = normalizeShiftLabel(data.currentUser?.shift || PLANT_SHIFTS[0]);

  const handleQuickRoleSelect = async (
    u: { id: number; email: string; departmentId: number | null; shift: string },
    newRole: string,
    newShift?: string
  ) => {
    setSwitchingId(u.id);
    const shiftToSave = newShift || u.shift || PLANT_SHIFTS[0];
    const rlsScope = newRole === 'Plant Admin' ? 'FULL_RLS_SUPERUSER' : 'COMPANY_RLS_SCOPED';
    try {
      await onUpdateUserRole(u.id, newRole, u.departmentId ?? null, shiftToSave, rlsScope);
      if (
        onSwitchOwnRole &&
        data.currentUser &&
        (u.id === data.currentUser.id ||
          u.email.toLowerCase() === data.currentUser.email.toLowerCase())
      ) {
        await onSwitchOwnRole(newRole, shiftToSave);
      }
      setRoleFeedback(`Updated ${u.email} to [${newRole}]`);
      setTimeout(() => setRoleFeedback(null), 3500);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCreateDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateDepartment) return;
    await onCreateDepartment(deptForm);
    setShowDeptModal(false);
    setDeptForm({
      code: `DEPT-0${data.departments.length + 2}`,
      name: '',
      headName: '',
      location: '',
    });
  };

  return (
    <div className="space-y-6">
      {/* Instant Role & Company Profile Quick Switcher Banner */}
      <div className="cmms-card rounded-md p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--accent-text)]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Quick Role Switch & Isolated Company Profile
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Active Company Workspace:{' '}
              <span className="font-mono-tech font-semibold text-[var(--accent-text)]">
                {currentCompanyName || data.currentUser?.companyName || 'Active Company'} (
                {currentCompanyCode || data.currentUser?.companyCode || 'COMPANY'})
              </span>{' '}
              — Data in this company profile is 100% isolated from other companies.
            </p>
          </div>
          {roleFeedback && (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono-tech px-3 py-1 rounded cmms-badge-success">
              <CheckCircle2 className="w-3.5 h-3.5" /> {roleFeedback}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Click Any Role Below for Instant Quick Role Switch (আপনার বর্তমান Role পরিবর্তন করুন):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {PLANT_ROLES.map((r) => {
              const isSelected = activeUserRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={async () => {
                    if (onSwitchOwnRole) {
                      await onSwitchOwnRole(r, activeUserShift);
                      setRoleFeedback(`Switched active role to [${r}]`);
                      setTimeout(() => setRoleFeedback(null), 3500);
                    }
                  }}
                  className={`p-3 rounded border text-left transition-all ${
                    isSelected
                      ? 'cmms-badge-info'
                      : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{r}</span>
                    {isSelected && (
                      <span className="text-[10px] font-mono-tech px-1.5 py-0.5 rounded cmms-badge-success">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono-tech text-[var(--text-muted)] mt-1">
                    {r === 'Plant Admin' ? 'FULL_RLS_SUPERUSER' : 'COMPANY_RLS_SCOPED'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 12-Hour Duty Shift Schedule Selector for Active Role */}
        <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-text)]">
            ডিউটি শিডিউল (12-Hour Duty Shift Schedule — G Shift at Top):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {PLANT_SHIFTS.map((shiftOption) => {
              const isSelectedShift = activeUserShift === shiftOption;
              return (
                <button
                  key={shiftOption}
                  type="button"
                  onClick={async () => {
                    if (onSwitchOwnRole) {
                      await onSwitchOwnRole(activeUserRole, shiftOption);
                      setRoleFeedback(`Switched duty shift to [${shiftOption}]`);
                      setTimeout(() => setRoleFeedback(null), 3500);
                    }
                  }}
                  className={`p-2.5 rounded border text-left transition-all ${
                    isSelectedShift
                      ? 'cmms-badge-success'
                      : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono-tech font-bold">{shiftOption}</span>
                    {isSelectedShift && (
                      <span className="text-[9px] font-mono-tech px-1.5 py-0.5 rounded cmms-badge-info">
                        ACTIVE
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Departments Table */}
      <div className="cmms-card rounded-md overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[var(--accent-color)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
              Plant Organization Departments ({currentCompanyCode || 'COMPANY'})
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono-tech text-[var(--accent-text)]">
              {data.departments.length} Active Units
            </span>
            {onCreateDepartment && (
              <button
                onClick={() => setShowDeptModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Department</span>
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-3 px-4">Dept Code</th>
                <th className="py-3 px-4">Department Name</th>
                <th className="py-3 px-4">Department Head</th>
                <th className="py-3 px-4">Plant Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] text-xs">
              {data.departments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 px-4 text-center text-[var(--text-secondary)]">
                    No departments registered for this company yet. Click "+ Add Department" to
                    create one.
                  </td>
                </tr>
              ) : (
                data.departments.map((d) => (
                  <tr key={d.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {d.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{d.name}</td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">{d.headName}</td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {d.location}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Role Mappings & Row Level Security (RLS) Governance */}
      <div className="cmms-card rounded-md overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
              Company Staff Role Mappings & Row-Level Security (RLS) Policies
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-mono-tech px-2.5 py-1 rounded cmms-badge-success">
            <Lock className="w-3 h-3" /> ISOLATED BY COMPANY CODE:{' '}
            {currentCompanyCode || 'COMPANY'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-3 px-4">Gmail Account</th>
                <th className="py-3 px-4">Display Name</th>
                <th className="py-3 px-4">Company Profile</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Shift</th>
                <th className="py-3 px-4">RLS Policy Scope</th>
                <th className="py-3 px-4">Quick Role Switch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] text-xs">
              {data.users.map((u) => {
                const roleOptions = PLANT_ROLES.includes(u.role as any)
                  ? [...PLANT_ROLES]
                  : [u.role, ...PLANT_ROLES];
                return (
                  <tr key={u.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {u.email}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {u.displayName}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {u.companyName || currentCompanyName || u.companyCode || 'Default'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-500">{u.role}</td>
                    <td className="py-3 px-4">
                      <select
                        value={normalizeShiftLabel(u.shift)}
                        disabled={switchingId === u.id}
                        onChange={(e) => handleQuickRoleSelect(u, u.role, e.target.value)}
                        className="cmms-input rounded px-2 py-1 text-xs font-mono-tech"
                      >
                        {PLANT_SHIFTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono-tech text-[11px] px-2 py-0.5 rounded cmms-badge-info">
                        {u.rlsPolicyLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        disabled={switchingId === u.id}
                        onChange={(e) => handleQuickRoleSelect(u, e.target.value)}
                        className="cmms-input rounded px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showDeptModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Create Factory Department
              </h3>
              <button
                onClick={() => setShowDeptModal(false)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ESC
              </button>
            </div>
            <form onSubmit={handleCreateDeptSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Department Code</label>
                <input
                  required
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                  className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Department Name</label>
                <input
                  required
                  placeholder="Mechanical & Utilities Maintenance"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="w-full cmms-input rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Department Head</label>
                <input
                  required
                  placeholder="Engr. Tariqul Islam"
                  value={deptForm.headName}
                  onChange={(e) => setDeptForm({ ...deptForm, headName: e.target.value })}
                  className="w-full cmms-input rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">
                  Plant Location / Building
                </label>
                <input
                  required
                  placeholder="Building A - Ground Floor"
                  value={deptForm.location}
                  onChange={(e) => setDeptForm({ ...deptForm, location: e.target.value })}
                  className="w-full cmms-input rounded px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-4 py-2 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold"
                >
                  Save Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const ActivityLogScreen: React.FC<{ data: PlantStateData }> = ({ data }) => {
  const [filterModule, setFilterModule] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const modules = ['ALL', 'Assets', 'Maintenance', 'Store', 'Procurement', 'Auth/Sync', 'RLS Policy'];

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data.activityLogs.filter((l) => {
      const matchesMod = filterModule === 'ALL' || l.module === filterModule;
      const matchesSearch =
        !q ||
        l.actorEmail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.entityCode.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q);
      return matchesMod && matchesSearch;
    });
  }, [data.activityLogs, filterModule, searchQuery]);

  return (
    <div className="space-y-5">
      <div className="cmms-card rounded-md p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--accent-color)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            Immutable Plant Activity & Sync Audit Log
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {modules.map((m) => (
              <button
                key={m}
                onClick={() => setFilterModule(m)}
                className={`px-2.5 py-1 rounded text-xs font-mono-tech border transition-colors ${
                  filterModule === m
                    ? 'cmms-badge-info'
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actor, action, ref..."
              className="w-full cmms-input rounded pl-8 pr-7 py-1 text-xs placeholder-[var(--text-muted)]"
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
        </div>
      </div>

      <div className="cmms-card rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="py-3 px-4">Actor Gmail</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity Ref</th>
                <th className="py-3 px-4">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)] text-xs">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                  <td className="py-3 px-4 font-mono-tech text-[var(--accent-text)]">
                    {log.actorEmail}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]">{log.actorRole}</td>
                  <td className="py-3 px-4">
                    <span className="font-mono-tech text-[11px] px-2 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)]">
                      {log.module}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono-tech font-semibold text-emerald-500">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 font-mono-tech text-[var(--accent-text)]">
                    {log.entityCode}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-primary)]">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const ReportsScreen: React.FC<{ data: PlantStateData }> = ({ data }) => {
  const totalDowntime = data.breakdownLogs.reduce((acc, b) => acc + b.downtimeMinutes, 0);
  const mttrMinutes =
    data.breakdownLogs.length > 0 ? Math.round(totalDowntime / data.breakdownLogs.length) : 0;
  const totalOperatingHours = data.machines.reduce((acc, m) => acc + m.operatingHours, 0);
  const mtbfHours =
    data.breakdownLogs.length > 0
      ? Math.round(totalOperatingHours / data.breakdownLogs.length)
      : totalOperatingHours;

  const inventoryValue = data.spareStock.reduce((acc, st) => {
    const part = data.spareParts.find((p) => p.id === st.sparePartId);
    return acc + st.quantityOnHand * (part?.unitCost || 0);
  }, 0);

  const totalPurchaseSpend = data.purchaseHistory.reduce((acc, p) => acc + p.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Executive Report Header & Print Action */}
      <div className="cmms-card rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--accent-color)]" />
            Factory Reliability, OEE & MRO Valuation Report
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Official executive maintenance summary &bull; Generated{' '}
            {new Date().toLocaleDateString()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold no-print self-start sm:self-auto"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Save PDF Report</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cmms-card rounded-md p-5">
          <div className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            Mean Time Between Failures (MTBF)
          </div>
          <div className="text-3xl font-bold font-mono-tech text-[var(--accent-text)] mt-2">
            {mtbfHours.toLocaleString()} hrs
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Across {data.machines.length} machines
          </div>
        </div>

        <div className="cmms-card rounded-md p-5">
          <div className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            Mean Time To Repair (MTTR)
          </div>
          <div className="text-3xl font-bold font-mono-tech text-amber-500 mt-2">
            {mttrMinutes} min
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Total Downtime: {totalDowntime} minutes
          </div>
        </div>

        <div className="cmms-card rounded-md p-5">
          <div className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            MRO Store Valuation
          </div>
          <div className="text-3xl font-bold font-mono-tech text-emerald-500 mt-2">
            ${inventoryValue.toLocaleString()}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            {data.spareStock.reduce((s, x) => s + x.quantityOnHand, 0)} total units in bins
          </div>
        </div>

        <div className="cmms-card rounded-md p-5">
          <div className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            Committed PO Spend
          </div>
          <div className="text-3xl font-bold font-mono-tech text-[var(--text-primary)] mt-2">
            ${totalPurchaseSpend.toLocaleString()}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            {data.purchaseHistory.length} Purchase Orders issued
          </div>
        </div>
      </div>

      {/* Reliability Breakdown by Machine */}
      <div className="cmms-card rounded-md p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[var(--accent-color)]" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            Machine Reliability, Operating Hours & Maintenance Cost Breakdown
          </h3>
        </div>
        <div className="space-y-3">
          {data.machines.map((m) => {
            const mHistCost = data.machineHistory
              .filter((h) => h.machineId === m.id)
              .reduce((s, h) => s + h.costIncurred, 0);
            return (
              <div
                key={m.id}
                className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tech text-xs font-bold text-[var(--accent-text)]">
                      {m.code}
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {m.name}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] font-mono-tech mt-0.5">
                    Operating Hours: {m.operatingHours.toLocaleString()}h &bull; Historical Repair
                    Cost: ${mHistCost.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-36 h-2.5 bg-[var(--bg-secondary)] rounded overflow-hidden border border-[var(--border-color)]">
                    <div
                      className={`h-full ${
                        m.healthScore >= 85
                          ? 'bg-emerald-500'
                          : m.healthScore >= 70
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${m.healthScore}%` }}
                    />
                  </div>
                  <span className="font-mono-tech text-xs font-bold text-[var(--text-primary)] w-12 text-right">
                    {m.healthScore}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Print-only signature footer */}
      <div className="print-only pt-10">
        <div className="grid grid-cols-3 gap-8 text-xs text-slate-600">
          <div className="border-t border-slate-400 pt-2 text-center">
            Prepared By (Maintenance Engineer)
          </div>
          <div className="border-t border-slate-400 pt-2 text-center">
            Verified By (Store & Procurement)
          </div>
          <div className="border-t border-slate-400 pt-2 text-center">
            Approved By (Plant Manager / GM)
          </div>
        </div>
      </div>
    </div>
  );
};

interface DocumentsScreenProps {
  data: PlantStateData;
  onCreateDocument: (payload: any) => Promise<void>;
}

export const DocumentsScreen: React.FC<DocumentsScreenProps> = ({ data, onCreateDocument }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [docForm, setDocForm] = useState({
    docCode: `DOC-SOP-${105 + data.documents.length}`,
    title: '',
    category: 'SOP Manual',
    machineId: data.machines[0]?.id || 1,
    fileFormat: 'PDF',
    fileSizeKb: 2450,
    version: 'v1.0',
    rlsAccessRole: 'All Maintenance & Production',
  });

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.documents;
    return data.documents.filter(
      (doc) =>
        doc.docCode.toLowerCase().includes(q) ||
        doc.title.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q)
    );
  }, [data.documents, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreateDocument({
        ...docForm,
        machineId: Number(docForm.machineId),
        fileSizeKb: Number(docForm.fileSizeKb),
      });
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="cmms-card rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--accent-color)]" />
            Engineering Documents, SOPs & Electrical Schematics Repository
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            RLS-protected technical manuals, EPLAN schematics, and OEM calibration certificates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doc code or title..."
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
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Register Document Metadata</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredDocs.map((doc) => {
          const machine = data.machines.find((m) => m.id === doc.machineId);
          return (
            <div
              key={doc.id}
              className="cmms-card hover:border-[var(--accent-color)] rounded-md p-4 flex flex-col justify-between gap-3 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono-tech text-xs font-semibold text-[var(--accent-text)]">
                    {doc.docCode}
                  </span>
                  <span className="font-mono-tech text-[11px] px-2 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)]">
                    {doc.category} &bull; {doc.version}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-2">
                  {doc.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Linked Asset:{' '}
                  <span className="font-mono-tech text-[var(--text-primary)]">
                    {machine ? `${machine.code} (${machine.name})` : 'Plant-Wide General'}
                  </span>
                </p>
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                <span className="font-mono-tech">
                  {doc.fileFormat} &bull; {(doc.fileSizeKb / 1024).toFixed(1)} MB
                </span>
                <span className="inline-flex items-center gap-1 font-mono-tech text-emerald-500">
                  <ShieldCheck className="w-3.5 h-3.5" /> {doc.rlsAccessRole}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Register Engineering Document Metadata
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Document Code</label>
                  <input
                    required
                    value={docForm.docCode}
                    onChange={(e) => setDocForm({ ...docForm, docCode: e.target.value })}
                    className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Category</label>
                  <select
                    value={docForm.category}
                    onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                    className="w-full cmms-input rounded px-3 py-2"
                  >
                    <option value="SOP Manual">SOP Manual</option>
                    <option value="Electrical Schematic">Electrical Schematic</option>
                    <option value="CAD Drawing">CAD Drawing</option>
                    <option value="OEM Warranty">OEM Warranty</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Document Title</label>
                <input
                  required
                  value={docForm.title}
                  onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                  placeholder="Siemens SINAMICS S120 Servo Drive Fault Diagnostics Manual"
                  className="w-full cmms-input rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Linked Machine</label>
                <select
                  value={docForm.machineId}
                  onChange={(e) => setDocForm({ ...docForm, machineId: Number(e.target.value) })}
                  className="w-full cmms-input rounded px-3 py-2"
                >
                  {data.machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>
              </div>

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
                  {submitting ? 'Saving...' : 'Save Metadata'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
