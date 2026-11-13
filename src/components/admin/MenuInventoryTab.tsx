'use client';

import { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit,
  Plus,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatInr } from '@/lib/format';
import { Button, Card, Modal } from '@/components/ui';

interface RecipeItemDetail {
  id: number;
  ingredientId: number;
  name: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED';
  quantityPerServing: number | null;
  unit: string;
  isOptional: boolean;
}

export interface AdminDishItem {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  basePricePaise: number;
  isVeg: boolean;
  spiceLevel: string;
  allergens: string[];
  prepTimeMins?: number;
  isAvailable: boolean;
  hasOptionalWarning: boolean;
  isOverridden: boolean;
  overrideReason?: string | null;
  archivedAt?: string | null;
  category: { id: number; name: string };
  station: { id: number; name: string; code: string };
  recipe: RecipeItemDetail[];
  missingRequired: { id: number; name: string; stockStatus: string }[];
  missingOptional: { id: number; name: string; stockStatus: string }[];
}

export function MenuInventoryTab({
  dishes,
  categories: _categories,
  stations: _stations,
  availableIngredients,
  onRefresh,
  showToast,
}: {
  dishes: AdminDishItem[];
  categories: { id: number; name: string }[];
  stations: { id: number; name: string; code: string }[];
  availableIngredients: { id: number; name: string; unit: string }[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const [expandedDishIds, setExpandedDishIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Bulk Delete Modal
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isDeleteAll, setIsDeleteAll] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Single Dish Soft Delete Modal
  const [dishToDelete, setDishToDelete] = useState<AdminDishItem | null>(null);

  // Manager Override Modal
  const [dishToOverride, setDishToOverride] = useState<AdminDishItem | null>(null);
  const [overrideValue, setOverrideValue] = useState<boolean>(true);
  const [overrideReason, setOverrideReason] = useState('');

  // Recipe Editor Modal
  const [editingRecipeDish, setEditingRecipeDish] = useState<AdminDishItem | null>(null);
  const [recipeFormItems, setRecipeFormItems] = useState<
    {
      ingredientId?: number;
      newIngredientName?: string;
      quantityPerServing?: number | null;
      unit: string;
      isOptional: boolean;
    }[]
  >([]);

  const toggleExpand = (id: number) => {
    setExpandedDishIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const activeDishes = dishes.filter((d) => !d.archivedAt);
  const archivedDishes = dishes.filter((d) => !!d.archivedAt);
  const currentList = viewMode === 'active' ? activeDishes : archivedDishes;

  // Single Soft Delete
  const handleConfirmSingleDelete = async () => {
    if (!dishToDelete) return;
    try {
      await apiFetch(`/api/inventory/dishes/${dishToDelete.id}`, { method: 'DELETE' });
      showToast(`Dish "${dishToDelete.name}" soft deleted.`);
      setDishToDelete(null);
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete dish');
    }
  };

  // Restore Soft-Deleted Dish
  const handleRestoreDish = async (dish: AdminDishItem) => {
    try {
      await apiFetch(`/api/inventory/dishes/${dish.id}/restore`, { method: 'POST' });
      showToast(`Dish "${dish.name}" restored successfully.`);
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to restore dish');
    }
  };

  // Bulk Soft Delete (Typed "DELETE" confirmation required)
  const handleBulkDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmText !== 'DELETE') {
      showToast('You must type the exact word "DELETE" to confirm.');
      return;
    }

    try {
      const payload = isDeleteAll
        ? { deleteAll: true, confirmationText: 'DELETE' }
        : { itemIds: selectedIds, confirmationText: 'DELETE' };

      await apiFetch('/api/inventory/dishes/bulk-delete', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast(`Selected dish(es) soft-deleted successfully.`);
      setShowBulkDeleteModal(false);
      setSelectedIds([]);
      setDeleteConfirmText('');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk delete failed');
    }
  };

  // Availability Override
  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishToOverride) return;
    if (!overrideReason.trim()) {
      showToast('Override reason is required.');
      return;
    }

    try {
      await apiFetch('/api/inventory/dishes/override', {
        method: 'POST',
        body: JSON.stringify({
          menuItemId: dishToOverride.id,
          isAvailableOverride: overrideValue,
          overrideReason: overrideReason.trim(),
        }),
      });

      showToast(`Availability override saved for "${dishToOverride.name}".`);
      setDishToOverride(null);
      setOverrideReason('');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save override');
    }
  };

  // Open Recipe Editor
  const handleOpenRecipeEditor = (dish: AdminDishItem) => {
    setEditingRecipeDish(dish);
    setRecipeFormItems(
      dish.recipe.map((r) => ({
        ingredientId: r.ingredientId,
        quantityPerServing: r.quantityPerServing,
        unit: r.unit,
        isOptional: r.isOptional,
      }))
    );
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipeDish) return;

    try {
      await apiFetch('/api/inventory/recipes', {
        method: 'POST',
        body: JSON.stringify({
          menuItemId: editingRecipeDish.id,
          items: recipeFormItems.map((item) => ({
            ingredientId: item.ingredientId,
            newIngredientName: item.newIngredientName?.trim() || undefined,
            quantityPerServing: item.quantityPerServing ? Number(item.quantityPerServing) : null,
            unit: item.unit,
            isOptional: !!item.isOptional,
          })),
        }),
      });

      showToast(`Recipe saved for "${editingRecipeDish.name}". Availability updated.`);
      setEditingRecipeDish(null);
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save recipe');
    }
  };

  const addRecipeRow = () => {
    setRecipeFormItems((prev) => [
      ...prev,
      {
        ingredientId: availableIngredients[0]?.id,
        quantityPerServing: 50,
        unit: availableIngredients[0]?.unit || 'g',
        isOptional: false,
      },
    ]);
  };

  const removeRecipeRow = (index: number) => {
    setRecipeFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 rounded-[20px] shadow-sm border border-leaf/10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('active')}
            className={`min-h-[40px] px-4 rounded-full text-[13px] font-extrabold transition ${
              viewMode === 'active' ? 'bg-sun text-ink shadow-sm' : 'bg-mint-bg text-leaf'
            }`}
          >
            Active Dishes ({activeDishes.length})
          </button>
          <button
            onClick={() => setViewMode('archived')}
            className={`min-h-[40px] px-4 rounded-full text-[13px] font-extrabold transition flex items-center gap-1.5 ${
              viewMode === 'archived' ? 'bg-sun text-ink shadow-sm' : 'bg-mint-bg text-leaf'
            }`}
          >
            <Archive className="w-4 h-4" /> Archived ({archivedDishes.length})
          </button>
        </div>

        {viewMode === 'active' && (
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                variant="tomato"
                onClick={() => {
                  setIsDeleteAll(false);
                  setShowBulkDeleteModal(true);
                }}
                className="min-h-[40px] px-3.5 text-[13px] inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Delete Selected ({selectedIds.length})
              </Button>
            )}
            <Button
              variant="mint"
              onClick={() => {
                setIsDeleteAll(true);
                setShowBulkDeleteModal(true);
              }}
              className="min-h-[40px] px-3.5 text-[13px] text-tomato hover:bg-tomato/15"
            >
              Delete All Dishes...
            </Button>
          </div>
        )}
      </div>

      {/* DISHES LIST / GRID */}
      <div className="space-y-3">
        {currentList.length === 0 ? (
          <Card className="p-10 text-center text-muted font-bold text-[14px]">
            {viewMode === 'active'
              ? 'No active dishes found.'
              : 'No archived dishes. Soft-deleted dishes appear here and can be restored.'}
          </Card>
        ) : (
          currentList.map((dish) => {
            const isExpanded = expandedDishIds.includes(dish.id);
            const isSelected = selectedIds.includes(dish.id);

            return (
              <Card
                key={dish.id}
                className={`p-4 border transition ${
                  dish.isAvailable ? 'border-leaf/15' : 'border-tomato/30 bg-tomato/5'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {viewMode === 'active' && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds((prev) => [...prev, dish.id]);
                          else setSelectedIds((prev) => prev.filter((id) => id !== dish.id));
                        }}
                        className="mt-1 w-4 h-4 rounded text-leaf focus:ring-leaf cursor-pointer"
                      />
                    )}

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-bold text-leaf">{dish.category.name}</span>
                        <h4 className="text-[16px] font-extrabold text-ink">{dish.name}</h4>
                        {dish.isAvailable ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-leaf/15 text-leaf font-extrabold text-[11px]">
                            <CheckCircle2 className="w-3 h-3" /> Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tomato/15 text-tomato font-extrabold text-[11px]">
                            <XCircle className="w-3 h-3" /> Unavailable
                          </span>
                        )}
                        {dish.isOverridden && (
                          <span className="px-2 py-0.5 rounded-full bg-sun text-ink text-[11px] font-bold">
                            Override: {dish.overrideReason}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[13px] text-muted mt-1">
                        <span className="font-extrabold text-ink">{formatInr(dish.basePricePaise)}</span>
                        <span>•</span>
                        <span>{dish.recipe.length} ingredient(s)</span>
                        <span>•</span>
                        <span>Station: {dish.station.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => toggleExpand(dish.id)}
                      className="min-h-[38px] px-3 rounded-full bg-mint-bg hover:bg-mint text-leaf text-[12px] font-bold inline-flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {isExpanded ? 'Hide Recipe' : 'View Recipe'}
                    </button>

                    {viewMode === 'active' ? (
                      <>
                        <button
                          onClick={() => handleOpenRecipeEditor(dish)}
                          className="min-h-[38px] px-3 rounded-full bg-mint-bg hover:bg-mint text-leaf text-[12px] font-bold inline-flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" /> Edit Recipe
                        </button>
                        <button
                          onClick={() => {
                            setDishToOverride(dish);
                            setOverrideValue(!dish.isAvailable);
                            setOverrideReason(dish.overrideReason || '');
                          }}
                          className="min-h-[38px] px-3 rounded-full bg-sun/30 hover:bg-sun text-ink text-[12px] font-bold"
                        >
                          Override
                        </button>
                        <button
                          onClick={() => setDishToDelete(dish)}
                          className="p-2 rounded-full hover:bg-tomato/15 text-muted hover:text-tomato transition"
                          title="Soft delete dish"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <Button
                        variant="leaf"
                        onClick={() => handleRestoreDish(dish)}
                        className="min-h-[38px] px-3.5 text-[12px] inline-flex items-center gap-1 font-extrabold"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restore Dish
                      </Button>
                    )}
                  </div>
                </div>

                {/* EXPANDABLE INGREDIENT LIST */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-leaf/10 space-y-2">
                    <p className="text-[12px] font-extrabold text-leaf">
                      Recipe Ingredients & Live Stock Status:
                    </p>
                    {dish.recipe.length === 0 ? (
                      <p className="text-[12px] text-muted italic">
                        No ingredients added to this dish yet. Tap &ldquo;Edit Recipe&rdquo; to define ingredients.
                      </p>
                    ) : (
                      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {dish.recipe.map((r) => (
                          <div
                            key={r.id}
                            className={`p-2.5 rounded-[12px] border text-[12px] flex items-center justify-between gap-2 ${
                              r.stockStatus === 'IN_STOCK'
                                ? 'bg-cream border-leaf/20'
                                : r.stockStatus === 'ORDERED'
                                ? 'bg-sun/20 border-sun'
                                : 'bg-tomato/10 border-tomato/30 text-tomato'
                            }`}
                          >
                            <div>
                              <span className="font-extrabold text-ink">{r.name}</span>
                              <p className="text-[11px] text-muted">
                                {r.quantityPerServing != null ? `${r.quantityPerServing} ${r.unit}` : r.unit}
                                {r.isOptional ? ' (Optional)' : ' (Required)'}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                r.stockStatus === 'IN_STOCK'
                                  ? 'bg-leaf/15 text-leaf'
                                  : r.stockStatus === 'ORDERED'
                                  ? 'bg-sun text-ink'
                                  : 'bg-tomato text-surface'
                              }`}
                            >
                              {r.stockStatus === 'IN_STOCK'
                                ? 'In stock'
                                : r.stockStatus === 'ORDERED'
                                ? 'Ordered'
                                : 'Out of stock'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* RECIPE EDITOR MODAL */}
      {editingRecipeDish && (
        <Modal
          open={true}
          onClose={() => setEditingRecipeDish(null)}
          title={`Edit Recipe: ${editingRecipeDish.name}`}
        >
          <form onSubmit={handleSaveRecipe} className="space-y-4">
            <p className="text-[12px] text-muted">
              Select ingredients and portions. A missing non-optional ingredient will automatically make this dish unavailable to guests.
            </p>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {recipeFormItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-[14px] bg-cream border border-leaf/15 flex flex-wrap items-center gap-2"
                >
                  {/* Select or inline create */}
                  <div className="flex-1 min-w-[140px]">
                    <select
                      value={item.ingredientId || ''}
                      onChange={(e) => {
                        const ingId = parseInt(e.target.value, 10);
                        const found = availableIngredients.find((i) => i.id === ingId);
                        setRecipeFormItems((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, ingredientId: ingId, unit: found?.unit || r.unit }
                              : r
                          )
                        );
                      }}
                      className="w-full min-h-[38px] px-2.5 rounded-[10px] bg-surface border border-leaf/20 text-ink text-[12px] font-bold"
                    >
                      {availableIngredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="w-20">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      placeholder="Qty"
                      value={item.quantityPerServing || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setRecipeFormItems((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, quantityPerServing: isNaN(val) ? null : val } : r))
                        );
                      }}
                      className="w-full min-h-[38px] px-2 rounded-[10px] bg-surface border border-leaf/20 text-ink text-[12px] font-bold"
                    />
                  </div>

                  {/* Unit */}
                  <div className="w-20">
                    <select
                      value={item.unit}
                      onChange={(e) =>
                        setRecipeFormItems((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                        )
                      }
                      className="w-full min-h-[38px] px-1.5 rounded-[10px] bg-surface border border-leaf/20 text-ink text-[12px] font-bold"
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="l">l</option>
                      <option value="ml">ml</option>
                      <option value="pcs">pcs</option>
                    </select>
                  </div>

                  {/* Optional toggle */}
                  <label className="flex items-center gap-1.5 text-[12px] font-bold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isOptional}
                      onChange={(e) =>
                        setRecipeFormItems((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, isOptional: e.target.checked } : r))
                        )
                      }
                      className="w-4 h-4 rounded text-leaf"
                    />
                    Optional
                  </label>

                  {/* Remove row */}
                  <button
                    type="button"
                    onClick={() => removeRecipeRow(idx)}
                    className="p-1 rounded-full text-muted hover:text-tomato transition ml-auto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="mint"
              onClick={addRecipeRow}
              className="w-full min-h-[40px] text-[13px] font-bold inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Ingredient Row
            </Button>

            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button type="button" variant="mint" onClick={() => setEditingRecipeDish(null)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="submit" variant="leaf" className="min-h-[44px] px-5">
                Save Recipe
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* SINGLE DISH SOFT-DELETE MODAL */}
      {dishToDelete && (
        <Modal
          open={true}
          onClose={() => setDishToDelete(null)}
          title={`Soft Delete "${dishToDelete.name}"?`}
        >
          <div className="space-y-4">
            <p className="text-[13px] text-muted">
              Soft deleting this dish removes it from the guest menu while safely preserving past orders, sales reports, and customer receipts. You can restore it anytime from the &ldquo;Archived&rdquo; tab.
            </p>
            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button variant="mint" onClick={() => setDishToDelete(null)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button variant="tomato" onClick={handleConfirmSingleDelete} className="min-h-[44px] px-5">
                Soft Delete Dish
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* BULK DELETE CONFIRMATION MODAL (TYPE 'DELETE') */}
      {showBulkDeleteModal && (
        <Modal
          open={true}
          onClose={() => setShowBulkDeleteModal(false)}
          title={isDeleteAll ? 'Delete All Dishes?' : `Delete ${selectedIds.length} Selected Dishes?`}
        >
          <form onSubmit={handleBulkDeleteSubmit} className="space-y-4">
            <div className="p-3.5 rounded-[14px] bg-tomato/15 text-tomato text-[13px] font-bold">
              <p>Warning: This action will soft-delete {isDeleteAll ? 'all active dishes' : `${selectedIds.length} selected dishes`}.</p>
            </div>
            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                To confirm, type <span className="text-tomato font-mono font-black">DELETE</span> below:
              </label>
              <input
                type="text"
                required
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-tomato/40 text-ink text-[14px] font-black focus:ring-tomato"
              />
            </div>
            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button type="button" variant="mint" onClick={() => setShowBulkDeleteModal(false)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="tomato"
                disabled={deleteConfirmText !== 'DELETE'}
                className="min-h-[44px] px-5"
              >
                Confirm Delete
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* AVAILABILITY OVERRIDE MODAL */}
      {dishToOverride && (
        <Modal
          open={true}
          onClose={() => setDishToOverride(null)}
          title={`Override Availability: ${dishToOverride.name}`}
        >
          <form onSubmit={handleSaveOverride} className="space-y-4">
            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">Target Availability</label>
              <select
                value={overrideValue ? 'true' : 'false'}
                onChange={(e) => setOverrideValue(e.target.value === 'true')}
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              >
                <option value="true">Force Available (Show to guests)</option>
                <option value="false">Force Unavailable (Hide / Disable)</option>
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-extrabold text-ink mb-1">
                Reason for Override (Required for Audit Log) <span className="text-tomato">*</span>
              </label>
              <input
                type="text"
                required
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. VIP table special batch, Chef approved substitute"
                className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold"
              />
            </div>

            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button type="button" variant="mint" onClick={() => setDishToOverride(null)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="submit" variant="leaf" className="min-h-[44px] px-5">
                Save Override
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
