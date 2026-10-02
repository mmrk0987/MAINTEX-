import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Plus, ShieldAlert } from 'lucide-react';
import { ComplaintItem, PlantStateData } from '../types.ts';

interface ComplaintsScreenProps {
  data: PlantStateData;
  onCreateComplaint: (payload: any) => Promise<void>;
  onAdvanceWorkflow: (
    id: number,
    nextStage: string,
    assignedTo: string,
    workNotes: string,
    verifiedByProduction: string
  ) => Promise<void>;
}

const STAGES = ['New', 'Assigned', 'Work Progress', 'Production Verification'] as const;

export const ComplaintsScreen: React.FC<ComplaintsScreenProps> = ({
  data,
  onCreateComplaint,
  onAdvanceWorkflow,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    complaintCode: `CMP-2026-${404 + data.complaints.length}`,
    machineId: data.machines[0]?.id || 1,
    sectionId: data.sections[0]?.id || 1,
    title: '',
    description: '',
    priority: 'High',
    assignedTo: 'Unassigned',
  });

  const getMachineCode = (id: number) =>
    data.machines.find((m) => m.id === id)?.code || `MCH-${id}`;

  const handleNextStage = async (item: ComplaintItem) => {
    const idx = STAGES.indexOf(item.workflowStage as any);
    if (idx === -1 || idx >= STAGES.length - 1) return;
    const nextStage = STAGES[idx + 1];
    const assigned =
      nextStage === 'Assigned' && item.assignedTo === 'Unassigned'
        ? 'Maintenance Team'
        : item.assignedTo;
    const notes =
      nextStage === 'Work Progress'
        ? 'Maintenance work in progress.'
        : nextStage === 'Production Verification'
        ? 'Repair completed; ready for production verification.'
        : item.workNotes;
    const verified =
      nextStage === 'Production Verification'
        ? 'Verified by Production'
        : item.verifiedByProduction;

    await onAdvanceWorkflow(item.id, nextStage, assigned, notes, verified);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreateComplaint({
        ...form,
        machineId: Number(form.machineId),
        sectionId: Number(form.sectionId),
      });
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="cmms-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-heading)] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#2563EB]" />
            Shop-Floor Complaints Lifecycle Pipeline (4-Stage Verification)
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Enforced 4-stage industrial lifecycle: 01. New &rarr; 02. Assigned &rarr; 03. Work
            Progress &rarr; 04. Production Verification
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Raise Production Complaint</span>
        </button>
      </div>

      {/* 4-Stage Workflow Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {STAGES.map((stage, stageIndex) => {
          const items = data.complaints.filter((c) => c.workflowStage === stage);
          return (
            <div key={stage} className="cmms-card flex flex-col min-h-[420px] overflow-hidden">
              <div className="px-4 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[#2563EB]/10 text-[#2563EB] font-mono-tech text-xs font-bold flex items-center justify-center">
                    0{stageIndex + 1}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-heading)]">
                    {stage}
                  </span>
                </div>
                <span className="font-mono-tech text-xs font-bold px-2 py-0.5 rounded-md cmms-badge-info">
                  {items.length}
                </span>
              </div>

              <div className="p-3.5 space-y-3 flex-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[var(--bg-primary)] border border-[var(--border-color)] hover:border-[#2563EB] rounded-xl p-4 space-y-2.5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tech text-xs font-semibold text-[#2563EB]">
                        {item.complaintCode}
                      </span>
                      <span
                        className={`font-mono-tech text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                          item.priority === 'Urgent'
                            ? 'cmms-badge-critical'
                            : item.priority === 'High'
                            ? 'cmms-badge-warning'
                            : 'cmms-badge-info'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {item.title}
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-[var(--border-color)] space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Asset:</span>
                        <span className="font-mono-tech font-semibold text-[var(--text-primary)]">
                          {getMachineCode(item.machineId)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Assignee:</span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {item.assignedTo}
                        </span>
                      </div>
                      {item.workNotes && (
                        <div className="text-[var(--text-secondary)] bg-[var(--bg-surface)] p-2 rounded-lg border border-[var(--border-color)] mt-1">
                          {item.workNotes}
                        </div>
                      )}
                    </div>

                    {stageIndex < STAGES.length - 1 ? (
                      <button
                        onClick={() => handleNextStage(item)}
                        className="w-full mt-2 py-2 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Move to {STAGES[stageIndex + 1]}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="w-full mt-2 py-2 px-3 rounded-lg cmms-badge-success text-[11px] font-mono-tech font-semibold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{item.verifiedByProduction || 'Production Verified'}</span>
                      </div>
                    )}
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="h-36 flex items-center justify-center text-xs font-mono-tech text-[var(--text-secondary)] border border-dashed border-[var(--border-color)] rounded-xl">
                    No complaints in {stage}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <div className="cmms-card max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-heading)]">
                Raise Shop-Floor Machine Complaint
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
                  <label className="block text-[var(--text-secondary)] mb-1">Complaint Code</label>
                  <input
                    required
                    value={form.complaintCode}
                    onChange={(e) => setForm({ ...form, complaintCode: e.target.value })}
                    className="w-full cmms-input px-3 py-2 font-mono-tech"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full cmms-input px-3 py-2"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Affected Machine</label>
                <select
                  value={form.machineId}
                  onChange={(e) => setForm({ ...form, machineId: Number(e.target.value) })}
                  className="w-full cmms-input px-3 py-2"
                >
                  {data.machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Complaint Title</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Hydraulic Clamping Pressure Fluctuation on Pallet B"
                  className="w-full cmms-input px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1">
                  Detailed Symptom Description
                </label>
                <textarea
                  rows={3}
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe symptom, alarm code, and impact on production cycle..."
                  className="w-full cmms-input px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold"
                >
                  {submitting ? 'Submitting...' : 'Submit to Stage 01 (New)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
