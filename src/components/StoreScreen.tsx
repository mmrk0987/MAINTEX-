import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  Plus,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { PlantStateData } from '../types.ts';

type StockIssueItem = PlantStateData['stockIssues'][number];

interface StoreScreenProps {
  data: PlantStateData;
  onIssueStock: (payload: any) => Promise<void>;
  onReceiveStock: (payload: any) => Promise<void>;
}

export const StoreScreen: React.FC<StoreScreenProps> = ({
  data,
  onIssueStock,
  onReceiveStock,
}) => {
  const [subTab, setSubTab] = useState<'stock' | 'issues' | 'receives' | 'alerts'>('stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OPTIMAL'>('ALL');
  const [printGatePass, setPrintGatePass] = useState<StockIssueItem | null>(null);
  const [modalMode, setModalMode] = useState<'issue' | 'receive' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [issueForm, setIssueForm] = useState({
    issueCode: `ISS-${new Date().getFullYear()}-${String(data.stockIssues.length + 1).padStart(3, '0')}`,
    sparePartId: data.spareParts[0]?.id || 0,
    machineId: data.machines[0]?.id || 0,
    quantityIssued: 1,
    issuedTo: '',
    workOrderRef: '',
  });

  const [receiveForm, setReceiveForm] = useState({
    grnCode: `GRN-${new Date().getFullYear()}-${String(data.stockReceives.length + 1).padStart(3, '0')}`,
    sparePartId: data.spareParts[0]?.id || 0,
    supplierName: '',
    quantityReceived: 1,
    unitPrice: 0,
    invoiceNumber: '',
  });

  const getPart = (id: number) => data.spareParts.find((p) => p.id === id);
  const getMachineCode = (id: number | null) =>
    id ? data.machines.find((m) => m.id === id)?.code || `MCH-${id}` : 'N/A';

  const q = searchQuery.trim().toLowerCase();

  const filteredStock = useMemo(() => {
    return data.spareStock.filter((st) => {
      const part = getPart(st.sparePartId);
      const isLow = st.quantityOnHand <= st.reorderPoint;
      const matchesFilter =
        stockFilter === 'ALL' ? true : stockFilter === 'LOW' ? isLow : !isLow;
      const matchesSearch =
        !q ||
        (part?.partNumber || '').toLowerCase().includes(q) ||
        (part?.name || '').toLowerCase().includes(q) ||
        st.binLocation.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [data.spareStock, data.spareParts, q, stockFilter]);

  const filteredIssues = useMemo(() => {
    if (!q) return data.stockIssues;
    return data.stockIssues.filter((iss) => {
      const part = getPart(iss.sparePartId);
      return (
        iss.issueCode.toLowerCase().includes(q) ||
        (part?.partNumber || '').toLowerCase().includes(q) ||
        (part?.name || '').toLowerCase().includes(q) ||
        iss.issuedTo.toLowerCase().includes(q) ||
        iss.workOrderRef.toLowerCase().includes(q)
      );
    });
  }, [data.stockIssues, data.spareParts, q]);

  const filteredReceives = useMemo(() => {
    if (!q) return data.stockReceives;
    return data.stockReceives.filter((rec) => {
      const part = getPart(rec.sparePartId);
      return (
        rec.grnCode.toLowerCase().includes(q) ||
        (part?.partNumber || '').toLowerCase().includes(q) ||
        (part?.name || '').toLowerCase().includes(q) ||
        rec.supplierName.toLowerCase().includes(q) ||
        rec.invoiceNumber.toLowerCase().includes(q)
      );
    });
  }, [data.stockReceives, data.spareParts, q]);

  const filteredAlerts = useMemo(() => {
    if (!q) return data.lowStockAlerts;
    return data.lowStockAlerts.filter((al) => {
      const part = getPart(al.sparePartId);
      return (
        (part?.partNumber || '').toLowerCase().includes(q) ||
        (part?.name || '').toLowerCase().includes(q) ||
        al.severity.toLowerCase().includes(q)
      );
    });
  }, [data.lowStockAlerts, data.spareParts, q]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modalMode === 'issue') {
        await onIssueStock({
          ...issueForm,
          sparePartId: Number(issueForm.sparePartId),
          machineId: Number(issueForm.machineId),
          quantityIssued: Number(issueForm.quantityIssued),
        });
      } else if (modalMode === 'receive') {
        await onReceiveStock({
          ...receiveForm,
          sparePartId: Number(receiveForm.sparePartId),
          quantityReceived: Number(receiveForm.quantityReceived),
          unitPrice: Number(receiveForm.unitPrice),
        });
      }
      setModalMode(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation & Store Action Bar */}
      <div className="cmms-card rounded-md p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'stock', label: 'Spare Stock', count: data.spareStock.length, icon: Package },
            {
              id: 'issues',
              label: 'Stock Issues',
              count: data.stockIssues.length,
              icon: ArrowUpRight,
            },
            {
              id: 'receives',
              label: 'Stock Receives (GRN)',
              count: data.stockReceives.length,
              icon: ArrowDownLeft,
            },
            {
              id: 'alerts',
              label: 'Low Stock Alerts',
              count: data.lowStockAlerts.length,
              icon: AlertTriangle,
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

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'stock' && (
            <div className="flex items-center gap-1">
              {(['ALL', 'LOW', 'OPTIMAL'] as const).map((flt) => (
                <button
                  key={flt}
                  type="button"
                  onClick={() => setStockFilter(flt)}
                  className={`px-2.5 py-1.5 rounded text-[11px] font-mono-tech font-semibold border transition-colors ${
                    stockFilter === flt
                      ? 'cmms-badge-info'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {flt === 'LOW' ? 'LOW STOCK' : flt}
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
              placeholder="Search SKU, part, bin..."
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
            onClick={() => setModalMode('issue')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-semibold transition-colors"
          >
            <ArrowUpRight className="w-4 h-4 text-amber-500" />
            <span>Issue Stock</span>
          </button>
          <button
            onClick={() => setModalMode('receive')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Receive Stock (GRN)</span>
          </button>
        </div>
      </div>

      {/* Store Tables */}
      <div className="cmms-card rounded-md overflow-hidden">
        {subTab === 'stock' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Part Number</th>
                  <th className="py-3 px-4">Spare Part Name</th>
                  <th className="py-3 px-4">Bin Location</th>
                  <th className="py-3 px-4 text-right">On-Hand Qty</th>
                  <th className="py-3 px-4 text-right">Reorder Point</th>
                  <th className="py-3 px-4">Stock Level & Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredStock.length > 0 ? (
                  filteredStock.map((st) => {
                    const part = getPart(st.sparePartId);
                    const isLow = st.quantityOnHand <= st.reorderPoint;
                    const ratio = Math.min(
                      100,
                      Math.round((st.quantityOnHand / Math.max(st.reorderPoint * 2, 1)) * 100)
                    );
                    return (
                      <tr key={st.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                        <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                          {part?.partNumber || `SP-${st.sparePartId}`}
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                          {part?.name || `Spare Part #${st.sparePartId}`}
                        </td>
                        <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                          {st.binLocation}
                        </td>
                        <td className="py-3 px-4 font-mono-tech font-bold text-right text-[var(--text-primary)]">
                          {st.quantityOnHand} {part?.unit || 'PCS'}
                        </td>
                        <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-secondary)]">
                          {st.reorderPoint} {part?.unit || 'PCS'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-20 h-2 bg-[var(--bg-secondary)] rounded overflow-hidden border border-[var(--border-color)]">
                              <div
                                className={`h-full ${isLow ? 'bg-red-500' : 'bg-emerald-500'}`}
                                style={{ width: `${ratio}%` }}
                              />
                            </div>
                            <span
                              className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                                isLow ? 'cmms-badge-critical' : 'cmms-badge-success'
                              }`}
                            >
                              {isLow ? 'LOW STOCK ALERT' : 'OPTIMAL'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 px-4 text-center text-xs text-[var(--text-secondary)]"
                    >
                      No stock items match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'issues' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Issue Code</th>
                  <th className="py-3 px-4">Spare Part</th>
                  <th className="py-3 px-4">Target Machine</th>
                  <th className="py-3 px-4 text-right">Qty Issued</th>
                  <th className="py-3 px-4">Issued To</th>
                  <th className="py-3 px-4">Work Order Ref</th>
                  <th className="py-3 px-4 no-print">Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredIssues.map((iss) => {
                  const part = getPart(iss.sparePartId);
                  return (
                    <tr key={iss.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                        {iss.issueCode}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                        {part?.partNumber} — {part?.name}
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                        {getMachineCode(iss.machineId)}
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-right text-amber-500 font-bold">
                        -{iss.quantityIssued} {part?.unit || 'PCS'}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">{iss.issuedTo}</td>
                      <td className="py-3 px-4 font-mono-tech text-[var(--accent-text)]">
                        {iss.workOrderRef}
                      </td>
                      <td className="py-3 px-4 no-print">
                        <button
                          type="button"
                          onClick={() => setPrintGatePass(iss)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-secondary)] hover:opacity-90 border border-[var(--border-color)] text-[11px] font-mono-tech text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <Printer className="w-3 h-3" /> Gate Pass
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'receives' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">GRN Code</th>
                  <th className="py-3 px-4">Spare Part</th>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4 text-right">Qty Received</th>
                  <th className="py-3 px-4 text-right">Unit Price</th>
                  <th className="py-3 px-4">Invoice Number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredReceives.map((rec) => {
                  const part = getPart(rec.sparePartId);
                  return (
                    <tr key={rec.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="py-3 px-4 font-mono-tech font-semibold text-[var(--accent-text)]">
                        {rec.grnCode}
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                        {part?.partNumber} — {part?.name}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">{rec.supplierName}</td>
                      <td className="py-3 px-4 font-mono-tech text-right text-emerald-500 font-bold">
                        +{rec.quantityReceived} {part?.unit || 'PCS'}
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-primary)]">
                        ${rec.unitPrice}
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-[var(--text-secondary)]">
                        {rec.invoiceNumber}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'alerts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="py-3 px-4">Spare Part</th>
                  <th className="py-3 px-4 text-right">Current Qty</th>
                  <th className="py-3 px-4 text-right">Min Threshold</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Alert Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredAlerts.map((al) => {
                  const part = getPart(al.sparePartId);
                  return (
                    <tr key={al.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                        <span className="font-mono-tech text-[var(--accent-text)] mr-2">
                          {part?.partNumber}
                        </span>
                        {part?.name}
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-right font-bold text-red-500">
                        {al.currentQty}
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-right text-[var(--text-secondary)]">
                        {al.thresholdQty}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-mono-tech text-[11px] px-2 py-0.5 rounded ${
                            al.severity === 'Critical'
                              ? 'cmms-badge-critical'
                              : 'cmms-badge-warning'
                          }`}
                        >
                          {al.severity}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono-tech text-[var(--text-primary)]">
                        {al.alertStatus}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Store Issue Gate Pass Modal */}
      {printGatePass && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div>
                <div className="text-[10px] font-mono-tech uppercase text-[var(--accent-text)]">
                  MAINTEX MRO STORE ISSUE GATE PASS
                </div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                  Voucher #{printGatePass.issueCode}
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
                  onClick={() => setPrintGatePass(null)}
                  className="px-2.5 py-1.5 rounded bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-4">
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Spare Part Issued
                </div>
                <div className="font-semibold text-[var(--text-primary)] mt-0.5">
                  {getPart(printGatePass.sparePartId)?.partNumber} &mdash;{' '}
                  {getPart(printGatePass.sparePartId)?.name}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Quantity Dispatched
                </div>
                <div className="font-mono-tech font-bold text-[var(--accent-text)] mt-0.5">
                  {printGatePass.quantityIssued} {getPart(printGatePass.sparePartId)?.unit || 'PCS'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Target Machine
                </div>
                <div className="font-mono-tech text-[var(--text-primary)] mt-0.5">
                  {getMachineCode(printGatePass.machineId)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-secondary)]">
                  Issued To / Work Order
                </div>
                <div className="font-medium text-[var(--text-primary)] mt-0.5">
                  {printGatePass.issuedTo} ({printGatePass.workOrderRef})
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-8 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
              <div className="border-t border-dashed border-[var(--border-color)] pt-2 text-center">
                Store Keeper Signature
              </div>
              <div className="border-t border-dashed border-[var(--border-color)] pt-2 text-center">
                Receiving Engineer Signature
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue / Receive Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="cmms-card rounded-md max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                {modalMode === 'issue'
                  ? 'Issue Spare Part to Shop Floor'
                  : 'Receive Goods (GRN) into MRO Store'}
              </h3>
              <button
                onClick={() => setModalMode(null)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ESC
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              {modalMode === 'issue' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">Issue Code</label>
                      <input
                        required
                        value={issueForm.issueCode}
                        onChange={(e) => setIssueForm({ ...issueForm, issueCode: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Quantity to Issue
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={issueForm.quantityIssued}
                        onChange={(e) =>
                          setIssueForm({ ...issueForm, quantityIssued: Number(e.target.value) })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Spare Part</label>
                    <select
                      value={issueForm.sparePartId}
                      onChange={(e) =>
                        setIssueForm({ ...issueForm, sparePartId: Number(e.target.value) })
                      }
                      className="w-full cmms-input rounded px-3 py-2"
                    >
                      {data.spareParts.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.partNumber} — {sp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Issued To Technician
                      </label>
                      <input
                        required
                        value={issueForm.issuedTo}
                        onChange={(e) => setIssueForm({ ...issueForm, issuedTo: e.target.value })}
                        className="w-full cmms-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Work Order Ref
                      </label>
                      <input
                        required
                        value={issueForm.workOrderRef}
                        onChange={(e) =>
                          setIssueForm({ ...issueForm, workOrderRef: e.target.value })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">GRN Code</label>
                      <input
                        required
                        value={receiveForm.grnCode}
                        onChange={(e) =>
                          setReceiveForm({ ...receiveForm, grnCode: e.target.value })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Quantity Received
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={receiveForm.quantityReceived}
                        onChange={(e) =>
                          setReceiveForm({
                            ...receiveForm,
                            quantityReceived: Number(e.target.value),
                          })
                        }
                        className="w-full cmms-input rounded px-3 py-2 font-mono-tech"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1">Spare Part</label>
                    <select
                      value={receiveForm.sparePartId}
                      onChange={(e) =>
                        setReceiveForm({ ...receiveForm, sparePartId: Number(e.target.value) })
                      }
                      className="w-full cmms-input rounded px-3 py-2"
                    >
                      {data.spareParts.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.partNumber} — {sp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Supplier Name
                      </label>
                      <input
                        required
                        value={receiveForm.supplierName}
                        onChange={(e) =>
                          setReceiveForm({ ...receiveForm, supplierName: e.target.value })
                        }
                        className="w-full cmms-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] mb-1">
                        Invoice Number
                      </label>
                      <input
                        required
                        value={receiveForm.invoiceNumber}
                        onChange={(e) =>
                          setReceiveForm({ ...receiveForm, invoiceNumber: e.target.value })
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
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white font-semibold"
                >
                  {submitting ? 'Updating Stock...' : 'Confirm Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
