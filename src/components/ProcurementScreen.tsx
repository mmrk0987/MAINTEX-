import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import { PlantStateData } from '../types.ts';

type PurchaseOrderItem = PlantStateData['purchaseHistory'][number];

interface ProcurementScreenProps {
  data: PlantStateData;
  onCreateRequisition: (payload: any) => Promise<void>;
  onApproveRequisition: (payload: any) => Promise<void>;
}

export const ProcurementScreen: React.FC<ProcurementScreenProps> = ({
  data,
  onCreateRequisition,
  onApproveRequisition,
}) => {
  const [subTab, setSubTab] = useState<'requisitions' | 'approvals' | 'purchases'>('requisitions');
  const [searchQuery, setSearchQuery] = useState('');
  const [reqFilter, setReqFilter] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
  const [printPo, setPrintPo] = useState<PurchaseOrderItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [reqForm, setReqForm] = useState({
    reqNumber: `PR-${new Date().getFullYear()}-${String(data.requisitions.length + 1).padStart(3, '0')}`,
    sparePartId: data.spareParts[0]?.id || 0,
    itemDescription: '',
    requestedQty: 1,
    estimatedTotalCost: 0,
    departmentId: data.departments[0]?.id || 0,
    urgency: 'High',
  });

  const q = searchQuery.trim().toLowerCase();

  const filteredRequisitions = useMemo(() => {
    return data.requisitions.filter((req) => {
      const matchesFilter =
        reqFilter === 'ALL'
          ? true
          : reqFilter === 'PENDING'
          ? req.status === 'Pending Approval'
          : req.status !== 'Pending Approval';
      const matchesSearch =
        !q ||
        req.reqNumber.toLowerCase().includes(q) ||
        req.itemDescription.toLowerCase().includes(q) ||
        req.requestedBy.toLowerCase().includes(q) ||
        req.urgency.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [data.requisitions, q, reqFilter]);

  const filteredApprovals = useMemo(() => {
    if (!q) return data.approvals;
    return data.approvals.filter((ap) => {
      const req = data.requisitions.find((r) => r.id === ap.requisitionId);
      return (
        (req?.reqNumber || '').toLowerCase().includes(q) ||
        ap.approverName.toLowerCase().includes(q) ||
        ap.comments.toLowerCase().includes(q)
      );
    });
  }, [data.approvals, data.requisitions, q]);

  const filteredPurchases = useMemo(() => {
    if (!q) return data.purchaseHistory;
    return data.purchaseHistory.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(q) ||
        po.vendorName.toLowerCase().includes(q) ||
        po.itemsSummary.toLowerCase().includes(q) ||
        po.deliveryStatus.toLowerCase().includes(q)
    );
  }, [data.purchaseHistory, q]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreateRequisition({
        ...reqForm,
        sparePartId: Number(reqForm.sparePartId),
        requestedQty: Number(reqForm.requestedQty),
        estimatedTotalCost: Number(reqForm.estimatedTotalCost),
        departmentId: Number(reqForm.departmentId),
      });
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="cmms-card rounded-md p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              id: 'requisitions',
              label: 'Requisitions',
              count: data.requisitions.length,
              icon: ClipboardList,
            },
            {
              id: 'approvals',
              label: 'Approvals Log',
              count: data.approvals.length,
              icon: FileCheck2,
            },
            {
              id: 'purchases',
              label: 'Purchase History (POs)',
              count: data.purchaseHistory.length,
              icon: ShoppingCart,
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
          {subTab === 'requisitions' && (
            <div className="flex items-center gap-1">
              {(['ALL', 'PENDING', 'APPROVED'] as const).map((flt) => (
                <button
                  key={flt}
                  type="button"
                  onClick={() => setReqFilter(flt)}
                  className={`px-2.5 py-1.5 rounded text-[11px] font-mono-tech font-semibold border transition-colors ${
                    reqFilter === flt
                      ? 'cmms-badge-info'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {flt}
                </button>
              ))}
            </div>
          )}

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PR, PO, vendor, item..."
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
            <span>New Purchase Requisition</span>
          </button>
        </div>
      </div>

      <div className="cmms-card rounded-md overflow-hidden">
        {subTab === 'requisitions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">PR Number</th>
                  <th className="py-3 px-4">Item Description</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Est. Total Cost</th>
                  <th className="py-3 px-4">Urgency</th>
                  <th className="py-3 px-4">Requested By</th>
                  <th className="py-3 px-4">Status / Approval Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredRequisitions.map((req) => (
                  <tr key={req.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {req.reqNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {req.itemDescription}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-primary)]">
                      {req.requestedQty}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-primary)]">
                      ${req.estimatedTotalCost.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                          req.urgency === 'Emergency'
                            ? 'cmms-badge-critical'
                            : 'cmms-badge-warning'
                        }`}
                      >
                        {req.urgency}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{req.requestedBy}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                            req.status === 'Pending Approval'
                              ? 'cmms-badge-warning'
                              : 'cmms-badge-success'
                          }`}
                        >
                          {req.status}
                        </span>
                        {req.status === 'Pending Approval' && (
                          <button
                            onClick={() =>
                              onApproveRequisition({
                                requisitionId: req.id,
                                decision: 'Approved',
                                comments: 'Approved & PO Dispatched to Authorized OEM Vendor',
                                vendorName: 'Rexroth Industrial Direct GmbH',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold no-print"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Approve & Issue PO
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'approvals' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Requisition Ref</th>
                  <th className="py-3 px-4">Approver</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Decision</th>
                  <th className="py-3 px-4">Audit Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredApprovals.map((ap) => {
                  const req = data.requisitions.find((r) => r.id === ap.requisitionId);
                  return (
                    <tr key={ap.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                        {req?.reqNumber || `REQ-${ap.requisitionId}`}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                        {ap.approverName}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{ap.approverRole}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono-tech text-[11px] px-2 py-0.5 rounded cmms-badge-success">
                          {ap.decision}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{ap.comments}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'purchases' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">PO Number</th>
                  <th className="py-3 px-4">Vendor Name</th>
                  <th className="py-3 px-4">Items Summary</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4">Order Date</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-4 no-print">Print PO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredPurchases.map((po) => (
                  <tr key={po.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                      {po.poNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {po.vendorName}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{po.itemsSummary}</td>
                    <td className="py-3 px-4 font-mono-tech text-right font-bold text-[var(--text-primary)]">
                      ${po.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                      {po.orderDate}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                          po.deliveryStatus === 'Delivered'
                            ? 'cmms-badge-success'
                            : 'cmms-badge-info'
                        }`}
                      >
                        {po.deliveryStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 no-print">
                      <button
                        type="button"
                        onClick={() => setPrintPo(po)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-[11px] font-mono-tech text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <Printer className="w-3 h-3" /> Print PO
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Official Purchase Order (PO) Modal */}
      {printPo && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div>
                <div className="text-[10px] font-mono-tech uppercase text-[var(--accent-text)]">
                  MAINTEX OFFICIAL MRO PURCHASE ORDER
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                  Purchase Order #{printPo.poNumber}
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
                  onClick={() => setPrintPo(null)}
                  className="px-2.5 py-1.5 rounded bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-4">
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Authorized Vendor
                </div>
                <div className="font-semibold text-[var(--text-primary)] mt-0.5">
                  {printPo.vendorName}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Order Date & Status
                </div>
                <div className="font-mono-tech text-[var(--accent-text)] font-bold mt-0.5">
                  {printPo.orderDate} &bull; {printPo.deliveryStatus}
                </div>
              </div>
              <div className="col-span-2 pt-2 border-t border-[var(--border-color)]">
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Line Items Description
                </div>
                <div className="font-medium text-[var(--text-primary)] mt-0.5">
                  {printPo.itemsSummary}
                </div>
              </div>
              <div className="col-span-2 pt-2 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-[var(--text-secondary)]">
                  Total Authorized PO Amount
                </span>
                <span className="text-lg font-mono-tech font-bold text-[var(--text-primary)]">
                  ${printPo.totalAmount.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-8 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
              <div className="border-t border-dashed border-[var(--border-color)] pt-2 text-center">
                Procurement Officer Signature
              </div>
              <div className="border-t border-dashed border-[var(--border-color)] pt-2 text-center">
                Plant Admin / GM Authorization
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Requisition Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                Raise MRO Purchase Requisition
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
                  <label className="block text-[var(--text-secondary)] mb-1">PR Number</label>
                  <input
                    required
                    value={reqForm.reqNumber}
                    onChange={(e) => setReqForm({ ...reqForm, reqNumber: e.target.value })}
                    className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Urgency</label>
                  <select
                    value={reqForm.urgency}
                    onChange={(e) => setReqForm({ ...reqForm, urgency: e.target.value })}
                    className="w-full cmms-input rounded px-3 py-2"
                  >
                    <option value="Emergency">Emergency</option>
                    <option value="High">High</option>
                    <option value="Standard">Standard</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1">Item Description</label>
                <input
                  required
                  value={reqForm.itemDescription}
                  onChange={(e) => setReqForm({ ...reqForm, itemDescription: e.target.value })}
                  className="w-full cmms-input rounded px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    Requested Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={reqForm.requestedQty}
                    onChange={(e) =>
                      setReqForm({ ...reqForm, requestedQty: Number(e.target.value) })
                    }
                    className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    Estimated Cost ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={reqForm.estimatedTotalCost}
                    onChange={(e) =>
                      setReqForm({ ...reqForm, estimatedTotalCost: Number(e.target.value) })
                    }
                    className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                  />
                </div>
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
                  {submitting ? 'Submitting...' : 'Submit Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
