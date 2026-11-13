'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, Plus, RefreshCw, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button, Card, Modal } from '@/components/ui';

export interface AdminIngredientItem {
  id: number;
  name: string;
  unit: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED';
  notes?: string | null;
  dishes: { id: number; name: string; isOptional: boolean; isAvailable: boolean }[];
  dishesCount: number;
}

export function IngredientsTab({
  ingredients,
  onRefresh,
  showToast,
}: {
  ingredients: AdminIngredientItem[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    unit: 'kg',
    stockStatus: 'IN_STOCK',
    notes: '',
  });

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      showToast('Ingredient name is required.');
      return;
    }

    try {
      await apiFetch('/api/inventory/ingredients', {
        method: 'POST',
        body: JSON.stringify({
          name: addForm.name.trim(),
          unit: addForm.unit,
          stockStatus: addForm.stockStatus,
          notes: addForm.notes.trim() || undefined,
        }),
      });

      showToast(`Ingredient "${addForm.name}" created.`);
      setShowAddModal(false);
      setAddForm({ name: '', unit: 'kg', stockStatus: 'IN_STOCK', notes: '' });
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create ingredient');
    }
  };

  const handleToggleStatus = async (
    ingredientId: number,
    nextStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED'
  ) => {
    try {
      await apiFetch(`/api/inventory/ingredients/${ingredientId}/status`, {
        method: 'POST',
        body: JSON.stringify({ stockStatus: nextStatus }),
      });
      showToast('Stock status updated.');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to toggle status');
    }
  };

  const statusBadge = (s: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED') => {
    if (s === 'IN_STOCK') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-leaf/15 text-leaf font-extrabold text-[12px]">
          <CheckCircle2 className="w-3.5 h-3.5" /> In stock
        </span>
      );
    }
    if (s === 'ORDERED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sun/30 text-ink font-extrabold text-[12px]">
          <Clock className="w-3.5 h-3.5" /> Ordered
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tomato/15 text-tomato font-extrabold text-[12px]">
        <XCircle className="w-3.5 h-3.5" /> Out of stock
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 rounded-[20px] shadow-sm border border-leaf/10">
        <div>
          <h3 className="text-[17px] font-extrabold text-ink">Shared Raw Ingredients</h3>
          <p className="text-[12px] text-muted font-bold">
            Ingredients are shared across recipes. When an ingredient is out, all dependent dishes disable automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="mint"
            onClick={onRefresh}
            className="min-h-[40px] px-3 text-[13px]"
            aria-label="Refresh ingredients"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="sun"
            onClick={() => setShowAddModal(true)}
            className="min-h-[40px] px-4 text-[13px] inline-flex items-center gap-1.5 font-extrabold"
          >
            <Plus className="w-4 h-4" /> Add Ingredient
          </Button>
        </div>
      </div>

      {/* Grid of Ingredients */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ingredients.map((ing) => (
          <Card key={ing.id} className="p-5 flex flex-col justify-between border border-leaf/10">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-[17px] font-extrabold text-ink">{ing.name}</h4>
                  <p className="text-[12px] text-muted font-bold">Unit: {ing.unit}</p>
                </div>
                {statusBadge(ing.stockStatus)}
              </div>

              {ing.notes && <p className="text-[12px] text-muted italic">&ldquo;{ing.notes}&rdquo;</p>}

              <div className="pt-2 border-t border-leaf/10 space-y-1">
                <p className="text-[12px] font-extrabold text-leaf">
                  Used in {ing.dishes.length} recipe(s):
                </p>
                {ing.dishes.length === 0 ? (
                  <p className="text-[12px] text-muted italic">Not currently assigned to any dish.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {ing.dishes.map((d) => (
                      <span
                        key={d.id}
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                          d.isAvailable ? 'bg-mint-bg text-leaf' : 'bg-tomato/15 text-tomato'
                        }`}
                      >
                        {d.name}
                        {d.isOptional ? ' (opt)' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-leaf/10 flex items-center justify-between gap-1">
              <button
                onClick={() => handleToggleStatus(ing.id, 'IN_STOCK')}
                disabled={ing.stockStatus === 'IN_STOCK'}
                className={`min-h-[38px] px-3 rounded-[10px] text-[12px] font-extrabold ${
                  ing.stockStatus === 'IN_STOCK' ? 'bg-leaf text-surface' : 'bg-cream text-leaf border border-leaf/20'
                }`}
              >
                In Stock
              </button>
              <button
                onClick={() => handleToggleStatus(ing.id, 'ORDERED')}
                disabled={ing.stockStatus === 'ORDERED'}
                className={`min-h-[38px] px-3 rounded-[10px] text-[12px] font-extrabold ${
                  ing.stockStatus === 'ORDERED' ? 'bg-sun text-ink' : 'bg-cream text-ink border border-leaf/20'
                }`}
              >
                Ordered
              </button>
              <button
                onClick={() => handleToggleStatus(ing.id, 'OUT_OF_STOCK')}
                disabled={ing.stockStatus === 'OUT_OF_STOCK'}
                className={`min-h-[38px] px-3 rounded-[10px] text-[12px] font-extrabold ${
                  ing.stockStatus === 'OUT_OF_STOCK' ? 'bg-tomato text-surface' : 'bg-cream text-tomato border border-tomato/30'
                }`}
              >
                Out of Stock
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* ADD INGREDIENT MODAL */}
      {showAddModal && (
        <Modal
          open={true}
          onClose={() => setShowAddModal(false)}
          title="Add New Raw Ingredient"
        >
          <form onSubmit={handleCreateIngredient} className="space-y-4">
            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Ingredient Name <span className="text-tomato">*</span>
              </label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Kashmiri Saffron, Black Urad Dal, Paneer"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">Measurement Unit</label>
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

              <div>
                <label className="block text-[13px] font-extrabold text-ink mb-1">Initial Stock Status</label>
                <select
                  value={addForm.stockStatus}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, stockStatus: e.target.value }))}
                  className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
                >
                  <option value="IN_STOCK">In Stock</option>
                  <option value="OUT_OF_STOCK">Out of Stock</option>
                  <option value="ORDERED">Ordered</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">Notes / Description (Optional)</label>
              <textarea
                value={addForm.notes}
                onChange={(e) => setAddForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Grade, supplier preferences, or storage guidelines..."
                rows={2}
                className="w-full p-3 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[13px] font-bold resize-none"
              />
            </div>

            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button type="button" variant="mint" onClick={() => setShowAddModal(false)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="submit" variant="leaf" className="min-h-[44px] px-5">
                Save Ingredient
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
