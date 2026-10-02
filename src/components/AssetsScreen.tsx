import React, { useMemo, useState } from 'react';
import { Boxes, Cpu, Layers, Plus, Search, Settings2, X } from 'lucide-react';
import { PlantStateData } from '../types.ts';

interface AssetsScreenProps {
  data: PlantStateData;
  onCreateSection: (payload: any) => Promise<void>;
  onCreateMachine: (payload: any) => Promise<void>;
  onCreateComponent: (payload: any) => Promise<void>;
  onCreateSparePart: (payload: any) => Promise<void>;
}

export const AssetsScreen: React.FC<AssetsScreenProps> = ({
  data,
  onCreateSection,
  onCreateMachine,
  onCreateComponent,
  onCreateSparePart,
}) => {
  const [subTab, setSubTab] = useState<'sections' | 'machines' | 'components' | 'spare_parts'>(
    'machines'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const q = searchQuery.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!q) return data.sections;
    return data.sections.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.floorZone.toLowerCase().includes(q) ||
        s.supervisor.toLowerCase().includes(q)
    );
  }, [data.sections, q]);

  const filteredMachines = useMemo(() => {
    return data.machines.filter((m) => {
      const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter;
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.manufacturer.toLowerCase().includes(q) ||
        m.modelNumber.toLowerCase().includes(q) ||
        m.serialNumber.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [data.machines, q, statusFilter]);

  const filteredComponents = useMemo(() => {
    if (!q) return data.components;
    return data.components.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.specification.toLowerCase().includes(q)
    );
  }, [data.components, q]);

  const filteredSpareParts = useMemo(() => {
    if (!q) return data.spareParts;
    return data.spareParts.filter(
      (sp) =>
        sp.name.toLowerCase().includes(q) ||
        sp.partNumber.toLowerCase().includes(q) ||
        sp.category.toLowerCase().includes(q)
    );
  }, [data.spareParts, q]);

  // Form states
  const [secForm, setSecForm] = useState({
    code: `SEC-0${data.sections.length + 1}`,
    name: '',
    departmentId: data.departments[0]?.id || 0,
    supervisor: '',
    floorZone: '',
    status: 'Operational',
  });

  const [mchForm, setMchForm] = useState({
    code: `MCH-CNC-${101 + data.machines.length}`,
    name: '',
    sectionId: data.sections[0]?.id || 0,
    manufacturer: '',
    modelNumber: '',
    serialNumber: `SN-${Math.floor(100000 + Math.random() * 900000)}`,
    criticality: 'Critical',
    status: 'Running',
    installedDate: new Date().toISOString().slice(0, 10),
  });

  const [cmpForm, setCmpForm] = useState({
    code: `CMP-0${data.components.length + 1}`,
    name: '',
    machineId: data.machines[0]?.id || 0,
    category: 'Mechanical',
    specification: '',
    condition: 'Optimal',
    installedDate: new Date().toISOString().slice(0, 10),
  });

  const [spForm, setSpForm] = useState({
    partNumber: `SP-OEM-${Math.floor(100 + Math.random() * 899)}`,
    name: '',
    componentId: data.components[0]?.id || 0,
    machineId: data.machines[0]?.id || 0,
    category: 'Hydraulic',
    unit: 'PCS',
    unitCost: 350,
    minStockLevel: 4,
    leadTimeDays: 7,
    initialStock: 10,
    binLocation: 'AISLE-B2-BIN08',
  });

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (subTab === 'sections') {
        await onCreateSection({
          ...secForm,
          departmentId: Number(secForm.departmentId),
        });
      } else if (subTab === 'machines') {
        await onCreateMachine({
          ...mchForm,
          sectionId: Number(mchForm.sectionId),
        });
      } else if (subTab === 'components') {
        await onCreateComponent({
          ...cmpForm,
          machineId: Number(cmpForm.machineId),
        });
      } else {
        await onCreateSparePart({
          ...spForm,
          componentId: Number(spForm.componentId),
          machineId: Number(spForm.machineId),
          unitCost: Number(spForm.unitCost),
          minStockLevel: Number(spForm.minStockLevel),
          leadTimeDays: Number(spForm.leadTimeDays),
          initialStock: Number(spForm.initialStock),
        });
      }
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar & Action CTA */}
      <div className="cmms-card rounded-md p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'sections', label: 'Sections', count: data.sections.length, icon: Layers },
            { id: 'machines', label: 'Machines', count: data.machines.length, icon: Cpu },
            {
              id: 'components',
              label: 'Components',
              count: data.components.length,
              icon: Settings2,
            },
            { id: 'spare_parts', label: 'Spare Parts', count: data.spareParts.length, icon: Boxes },
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

        <div className="flex flex-wrap items-center gap-2.5 no-print">
          {subTab === 'machines' && (
            <div className="flex items-center gap-1">
              {['ALL', 'Running', 'Breakdown', 'Under PM'].map((st) => (
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

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                subTab === 'machines'
                  ? 'Search machine name or code...'
                  : subTab === 'sections'
                  ? 'Search section or supervisor...'
                  : subTab === 'components'
                  ? 'Search component or spec...'
                  : 'Search part number or name...'
              }
              className="w-full cmms-input rounded pl-8 pr-7 py-1.5 text-xs placeholder-[var(--text-muted)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title="Clear search"
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
            <span>
              Add{' '}
              {subTab === 'sections'
                ? 'Section'
                : subTab === 'machines'
                ? 'Machine'
                : subTab === 'components'
                ? 'Component'
                : 'Spare Part'}
            </span>
          </button>
        </div>
      </div>

      {/* Tables per sub-tab */}
      <div className="cmms-card rounded-md overflow-hidden">
        {subTab === 'sections' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Section Code</th>
                  <th className="py-3 px-4">Section Name</th>
                  <th className="py-3 px-4">Floor Zone</th>
                  <th className="py-3 px-4">Supervisor</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredSections.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {s.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{s.name}</td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {s.floorZone}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">{s.supervisor}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono-tech text-[11px] px-2 py-0.5 rounded cmms-badge-success">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'machines' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Machine Name</th>
                  <th className="py-3 px-4">OEM / Model / Serial</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Criticality</th>
                  <th className="py-3 px-4">Health Index</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredMachines.length > 0 ? (
                  filteredMachines.map((m) => (
                    <tr key={m.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                        {m.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{m.name}</td>
                      <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                        {m.manufacturer} &bull; {m.modelNumber} ({m.serialNumber})
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {data.sections.find((s) => s.id === m.sectionId)?.name ||
                          `Section #${m.sectionId}`}
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-[var(--text-primary)]">
                        {m.criticality}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-[var(--bg-secondary)] rounded overflow-hidden border border-[var(--border-color)]">
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
                          <span className="font-mono-tech text-xs font-semibold text-[var(--text-primary)]">
                            {m.healthScore}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                            m.status === 'Running'
                              ? 'cmms-badge-success'
                              : m.status === 'Breakdown'
                              ? 'cmms-badge-critical'
                              : 'cmms-badge-warning'
                          }`}
                        >
                          {m.status === 'Breakdown' && (
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                          )}
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 px-4 text-center text-xs text-[var(--text-secondary)]"
                    >
                      No machines found matching{' '}
                      <span className="font-mono-tech text-[var(--accent-text)]">
                        &ldquo;{searchQuery}&rdquo;
                      </span>
                      .
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'components' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Component Code</th>
                  <th className="py-3 px-4">Component Name</th>
                  <th className="py-3 px-4">Parent Machine</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Technical Spec</th>
                  <th className="py-3 px-4">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredComponents.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {c.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{c.name}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      {data.machines.find((m) => m.id === c.machineId)?.name ||
                        `Machine #${c.machineId}`}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--accent-text)]">
                      {c.category}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {c.specification}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                          c.condition === 'Optimal' || c.condition === 'Good'
                            ? 'cmms-badge-success'
                            : 'cmms-badge-warning'
                        }`}
                      >
                        {c.condition}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'spare_parts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Part Number</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4 text-right">Min Stock</th>
                  <th className="py-3 px-4 text-right">Lead Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredSpareParts.map((sp) => (
                  <tr key={sp.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {sp.partNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{sp.name}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{sp.category}</td>
                    <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-primary)]">
                      ${sp.unitCost.toLocaleString()} / {sp.unit}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-right text-amber-500 font-semibold">
                      {sp.minStockLevel} {sp.unit}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-secondary)]">
                      {sp.leadTimeDays} Days
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Register New{' '}
                {subTab === 'sections'
                  ? 'Plant Section'
                  : subTab === 'machines'
                  ? 'Industrial Machine'
                  : subTab === 'components'
                  ? 'Machine Sub-Component'
                  : 'MRO Spare Part'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
              {subTab === 'sections' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Section Code</label>
                      <input
                        required
                        value={secForm.code}
                        onChange={(e) => setSecForm({ ...secForm, code: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Supervisor</label>
                      <input
                        required
                        value={secForm.supervisor}
                        onChange={(e) => setSecForm({ ...secForm, supervisor: e.target.value })}
                        placeholder="Engr. R. Vance"
                        className="w-full cmms-input rounded px-3 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Section Name</label>
                    <input
                      required
                      value={secForm.name}
                      onChange={(e) => setSecForm({ ...secForm, name: e.target.value })}
                      placeholder="Automated Stamping & Die Line"
                      className="w-full cmms-input rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Floor Zone</label>
                    <input
                      required
                      value={secForm.floorZone}
                      onChange={(e) => setSecForm({ ...secForm, floorZone: e.target.value })}
                      placeholder="Hall 2 - Bay C"
                      className="w-full cmms-input rounded px-3 py-2"
                    />
                  </div>
                </>
              )}

              {subTab === 'machines' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Machine Code</label>
                      <input
                        required
                        value={mchForm.code}
                        onChange={(e) => setMchForm({ ...mchForm, code: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Section</label>
                      <select
                        value={mchForm.sectionId}
                        onChange={(e) =>
                          setMchForm({ ...mchForm, sectionId: Number(e.target.value) })
                        }
                        className="w-full cmms-input rounded px-3 py-2"
                      >
                        {data.sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code} — {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Machine Name</label>
                    <input
                      required
                      value={mchForm.name}
                      onChange={(e) => setMchForm({ ...mchForm, name: e.target.value })}
                      placeholder="Okuma MULTUS U4000 CNC Turn-Mill"
                      className="w-full cmms-input rounded px-3 py-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Manufacturer</label>
                      <input
                        required
                        value={mchForm.manufacturer}
                        onChange={(e) => setMchForm({ ...mchForm, manufacturer: e.target.value })}
                        placeholder="Okuma Corp"
                        className="w-full cmms-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Model Number</label>
                      <input
                        required
                        value={mchForm.modelNumber}
                        onChange={(e) => setMchForm({ ...mchForm, modelNumber: e.target.value })}
                        placeholder="MULTUS-U4000"
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                  </div>
                </>
              )}

              {subTab === 'components' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Component Code
                      </label>
                      <input
                        required
                        value={cmpForm.code}
                        onChange={(e) => setCmpForm({ ...cmpForm, code: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Parent Machine
                      </label>
                      <select
                        value={cmpForm.machineId}
                        onChange={(e) =>
                          setCmpForm({ ...cmpForm, machineId: Number(e.target.value) })
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
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">
                      Component Name
                    </label>
                    <input
                      required
                      value={cmpForm.name}
                      onChange={(e) => setCmpForm({ ...cmpForm, name: e.target.value })}
                      placeholder="Heidenhain Linear Optical Scale Encoder"
                      className="w-full cmms-input rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Specification</label>
                    <input
                      required
                      value={cmpForm.specification}
                      onChange={(e) => setCmpForm({ ...cmpForm, specification: e.target.value })}
                      placeholder=" ±3 µm Accuracy / EnDat 2.2 Interface"
                      className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                    />
                  </div>
                </>
              )}

              {subTab === 'spare_parts' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Part Number (SKU)
                      </label>
                      <input
                        required
                        value={spForm.partNumber}
                        onChange={(e) => setSpForm({ ...spForm, partNumber: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Bin Location</label>
                      <input
                        required
                        value={spForm.binLocation}
                        onChange={(e) => setSpForm({ ...spForm, binLocation: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Part Name</label>
                    <input
                      required
                      value={spForm.name}
                      onChange={(e) => setSpForm({ ...spForm, name: e.target.value })}
                      placeholder="Festo Solenoid Manifold Valve 24VDC"
                      className="w-full cmms-input rounded px-3 py-2"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Unit Cost ($)
                      </label>
                      <input
                        type="number"
                        required
                        value={spForm.unitCost}
                        onChange={(e) =>
                          setSpForm({ ...spForm, unitCost: Number(e.target.value) })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Initial Qty</label>
                      <input
                        type="number"
                        required
                        value={spForm.initialStock}
                        onChange={(e) =>
                          setSpForm({ ...spForm, initialStock: Number(e.target.value) })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Min Alert Qty
                      </label>
                      <input
                        type="number"
                        required
                        value={spForm.minStockLevel}
                        onChange={(e) =>
                          setSpForm({ ...spForm, minStockLevel: Number(e.target.value) })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
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
                  {submitting ? 'Saving...' : 'Save to PostgreSQL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
