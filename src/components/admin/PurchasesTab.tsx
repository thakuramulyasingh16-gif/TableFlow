'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Edit2, Plus, RefreshCw, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button, Card, Modal, Skeleton } from '@/components/ui';

interface PurchaseItem {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  totalCostPaise: number;
  totalCostRupees: number;
  supplier?: string | null;
  notes?: string | null;
  purchasedByName: string;
  purchasedAt: string;
  receivedAt?: string | null;
  alertId?: number | null;
}

interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

export function PurchasesTab({
  ingredients,
  showToast,
}: {
  ingredients: IngredientOption[];
  showToast: (msg: string) => void;
}) {
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSpendRupees, setTotalSpendRupees] = useState(0);

  // Filters
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Proactive Add Purchase Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    ingredientId: '',
    quantity: '',
    unit: 'kg',
    totalCostRupees: '',
    supplier: '',
    notes: '',
    isReceived: true,
  });

  // Edit Purchase Modal
  const [editingPurchase, setEditingPurchase] = useState<PurchaseItem | null>(null);
  const [editForm, setEditForm] = useState({
    quantity: '',
    unit: 'kg',
    totalCostRupees: '',
    supplier: '',
    notes: '',
    reason: '',
  });

  const loadPurchases = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedIngredientId !== 'all') params.set('ingredientId', selectedIngredientId);
      if (supplierFilter.trim()) params.set('supplier', supplierFilter.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await apiFetch<{
        purchases: PurchaseItem[];
        totalSpendRupees: number;
      }>(`/api/inventory/purchases?${params.toString()}`);

      setPurchases(res.purchases || []);
      setTotalSpendRupees(res.totalSpendRupees || 0);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, [selectedIngredientId, supplierFilter, startDate, endDate, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPurchases();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPurchases]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedIngredientId !== 'all') params.set('ingredientId', selectedIngredientId);
    if (supplierFilter.trim()) params.set('supplier', supplierFilter.trim());
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('format', 'csv');

    window.open(`/api/inventory/purchases?${params.toString()}`, '_blank');
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.ingredientId) {
      showToast('Please select an ingredient.');
      return;
    }
    const qty = parseFloat(addForm.quantity);
    const amount = parseFloat(addForm.totalCostRupees);
    if (isNaN(qty) || qty <= 0) {
      showToast('Quantity must be greater than zero.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast('Total cost must be greater than zero.');
      return;
    }

    try {
      await apiFetch('/api/inventory/purchases', {
        method: 'POST',
        body: JSON.stringify({
          ingredientId: parseInt(addForm.ingredientId, 10),
          quantity: qty,
          unit: addForm.unit,
          totalCostRupees: amount,
          supplier: addForm.supplier.trim() || undefined,
          notes: addForm.notes.trim() || undefined,
          isReceived: addForm.isReceived,
        }),
      });

      showToast('Purchase recorded successfully.');
      setShowAddModal(false);
      setAddForm({
        ingredientId: '',
        quantity: '',
        unit: 'kg',
        totalCostRupees: '',
        supplier: '',
        notes: '',
        isReceived: true,
      });
      await loadPurchases();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record purchase');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;
    if (!editForm.reason.trim()) {
      showToast('Reason is required when editing a purchase.');
      return;
    }
    const qty = parseFloat(editForm.quantity);
    const amount = parseFloat(editForm.totalCostRupees);

    try {
      await apiFetch(`/api/inventory/purchases/${editingPurchase.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantity: isNaN(qty) ? undefined : qty,
          unit: editForm.unit,
          totalCostRupees: isNaN(amount) ? undefined : amount,
          supplier: editForm.supplier.trim() || null,
          notes: editForm.notes.trim() || null,
          reason: editForm.reason.trim(),
        }),
      });

      showToast('Purchase updated successfully.');
      setEditingPurchase(null);
      await loadPurchases();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update purchase');
    }
  };

  return (
    <div className="space-y-5">
      {/* Action and Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 rounded-[20px] shadow-sm border border-leaf/10">
        <div className="flex flex-wrap items-center gap-2">
          {/* Ingredient Filter */}
          <select
            value={selectedIngredientId}
            onChange={(e) => setSelectedIngredientId(e.target.value)}
            className="min-h-[40px] px-3 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[13px] font-bold"
          >
            <option value="all">All Ingredients</option>
            {ingredients.map((ing) => (
              <option key={ing.id} value={String(ing.id)}>
                {ing.name}
              </option>
            ))}
          </select>

          {/* Supplier Search */}
          <input
            type="text"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            placeholder="Filter by supplier..."
            className="min-h-[40px] px-3 rounded-[12px] bg-cream border border-leaf/20 text-ink placeholder:text-muted/60 text-[13px] font-bold"
          />

          {/* Date range */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[12px] font-bold"
            title="Start date"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="min-h-[40px] px-2.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[12px] font-bold"
            title="End date"
          />

          {(selectedIngredientId !== 'all' || supplierFilter || startDate || endDate) && (
            <button
              onClick={() => {
                setSelectedIngredientId('all');
                setSupplierFilter('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-[12px] text-muted hover:text-tomato font-bold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="mint"
            onClick={loadPurchases}
            className="min-h-[40px] px-3 text-[13px]"
            aria-label="Refresh purchases"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="leaf"
            onClick={handleExportCsv}
            className="min-h-[40px] px-3.5 text-[13px] inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button
            variant="sun"
            onClick={() => setShowAddModal(true)}
            className="min-h-[40px] px-4 text-[13px] inline-flex items-center gap-1.5 font-extrabold"
          >
            <Plus className="w-4 h-4" /> Record Purchase
          </Button>
        </div>
      </div>

      {/* Spend Summary Banner */}
      <div className="flex items-center justify-between px-5 py-3 rounded-[16px] bg-cream border border-leaf/15">
        <span className="text-[13px] font-bold text-muted">
          Showing {purchases.length} purchase record(s)
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-ink">Total Spend:</span>
          <span className="text-[18px] font-extrabold text-tomato">
            ₹{totalSpendRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {loading && (
        <Card className="p-6">
          <Skeleton className="h-64 rounded-[16px]" />
        </Card>
      )}

      {/* PURCHASES TABLE */}
      {!loading && (
        <Card className="p-0 overflow-hidden shadow-card border border-leaf/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="bg-mint-bg/50 border-b border-leaf/10 text-muted font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Ingredient</th>
                  <th className="py-3 px-4">Quantity</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-leaf/5 font-bold">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted font-normal">
                      No raw-material purchases found. Tap &ldquo;Record Purchase&rdquo; to add one.
                    </td>
                  </tr>
                ) : (
                  purchases.map((p) => {
                    const isReceived = p.receivedAt !== null;
                    return (
                      <tr key={p.id} className="hover:bg-cream/40 transition">
                        <td className="py-3 px-4 text-ink font-extrabold whitespace-nowrap">
                          {p.purchasedAt.slice(0, 10)}
                        </td>
                        <td className="py-3 px-4 text-ink font-extrabold">{p.ingredientName}</td>
                        <td className="py-3 px-4 text-muted whitespace-nowrap">
                          {p.quantity} {p.unit}
                        </td>
                        <td className="py-3 px-4 text-right text-tomato font-extrabold whitespace-nowrap">
                          ₹{p.totalCostRupees.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-muted">{p.supplier || '—'}</td>
                        <td className="py-3 px-4 text-leaf font-bold whitespace-nowrap">
                          {p.purchasedByName}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isReceived ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-leaf/15 text-leaf text-[11px] font-extrabold">
                              Received
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-sun/30 text-ink text-[11px] font-extrabold">
                              In Transit
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEditingPurchase(p);
                              setEditForm({
                                quantity: String(p.quantity),
                                unit: p.unit,
                                totalCostRupees: String(p.totalCostRupees),
                                supplier: p.supplier || '',
                                notes: p.notes || '',
                                reason: '',
                              });
                            }}
                            className="p-1.5 rounded-[8px] hover:bg-mint-bg text-muted hover:text-leaf transition cursor-pointer"
                            title="Edit purchase record"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* PROACTIVE ADD PURCHASE MODAL */}
      {showAddModal && (
        <Modal
          open={true}
          onClose={() => setShowAddModal(false)}
          title="Record Material Purchase"
        >
          <form onSubmit={handleCreatePurchase} className="space-y-4">
            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Ingredient <span className="text-tomato">*</span>
              </label>
              <select
                value={addForm.ingredientId}
                onChange={(e) => {
                  const id = e.target.value;
                  const ing = ingredients.find((i) => String(i.id) === id);
                  setAddForm((prev) => ({
                    ...prev,
                    ingredientId: id,
                    unit: ing ? ing.unit : prev.unit,
                  }));
                }}
                required
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              >
                <option value="">Select an ingredient...</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={String(ing.id)}>
                    {ing.name} ({ing.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">
                  Quantity <span className="text-tomato">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={addForm.quantity}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  placeholder="e.g. 10"
                  className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                />
              </div>

              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">
                  Unit <span className="text-tomato">*</span>
                </label>
                <select
                  value={addForm.unit}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, unit: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                >
                  <option value="kg">kg (Kilograms)</option>
                  <option value="g">g (Grams)</option>
                  <option value="l">l (Liters)</option>
                  <option value="ml">ml (Milliliters)</option>
                  <option value="pcs">pcs (Pieces)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Total Amount Paid (₹ Rupees) <span className="text-tomato">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={addForm.totalCostRupees}
                onChange={(e) => setAddForm((prev) => ({ ...prev, totalCostRupees: e.target.value }))}
                placeholder="e.g. 2450.00"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
              <p className="text-[11px] text-muted mt-1">Stored securely in integer paise on the server.</p>
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Supplier (Optional)
              </label>
              <input
                type="text"
                value={addForm.supplier}
                onChange={(e) => setAddForm((prev) => ({ ...prev, supplier: e.target.value }))}
                placeholder="e.g. Metro Cash & Carry, Amul Dairy Depot"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={addForm.notes}
                onChange={(e) => setAddForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Invoice or batch notes..."
                rows={2}
                className="w-full p-3 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[13px] font-bold resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isReceived"
                checked={addForm.isReceived}
                onChange={(e) => setAddForm((prev) => ({ ...prev, isReceived: e.target.checked }))}
                className="w-4 h-4 rounded text-leaf focus:ring-leaf"
              />
              <label htmlFor="isReceived" className="text-[13px] font-bold text-ink cursor-pointer">
                Stock already received in kitchen (sets ingredient to In Stock immediately)
              </label>
            </div>

            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button type="button" variant="mint" onClick={() => setShowAddModal(false)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="submit" variant="leaf" className="min-h-[44px] px-5">
                Save Purchase
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* EDIT PURCHASE MODAL (REQUIRES REASON) */}
      {editingPurchase && (
        <Modal
          open={true}
          onClose={() => setEditingPurchase(null)}
          title={`Edit Purchase #${editingPurchase.id} (${editingPurchase.ingredientName})`}
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                />
              </div>

              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">Unit</label>
                <select
                  value={editForm.unit}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, unit: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="l">l</option>
                  <option value="ml">ml</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Total Amount Paid (₹ Rupees)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={editForm.totalCostRupees}
                onChange={(e) => setEditForm((prev) => ({ ...prev, totalCostRupees: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">Supplier</label>
              <input
                type="text"
                value={editForm.supplier}
                onChange={(e) => setEditForm((prev) => ({ ...prev, supplier: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
                className="w-full p-3 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[13px] font-bold resize-none"
              />
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-tomato mb-1">
                Reason for Edit (Required for Audit Log) <span className="text-tomato">*</span>
              </label>
              <input
                type="text"
                required
                value={editForm.reason}
                onChange={(e) => setEditForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="e.g. Corrected invoice price discrepancy"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-tomato/30 text-ink text-[14px] font-bold focus:ring-tomato"
              />
            </div>

            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button type="button" variant="mint" onClick={() => setEditingPurchase(null)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="submit" variant="leaf" className="min-h-[44px] px-5">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
