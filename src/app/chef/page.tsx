'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChefHat,
  Clock,
  Layers,
  LogOut,
  PackageOpen,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button, Card, Modal, Skeleton, Toast } from '@/components/ui';

interface RecipeEntry {
  id: number;
  ingredientId: number;
  name: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED';
  quantityPerServing: number | null;
  unit: string;
  isOptional: boolean;
}

interface DishItem {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  isVeg: boolean;
  spiceLevel: string;
  isAvailable: boolean;
  hasOptionalWarning: boolean;
  category: { id: number; name: string };
  station: { id: number; name: string; code: string };
  recipe: RecipeEntry[];
  missingRequired: { id: number; name: string; stockStatus: string }[];
  missingOptional: { id: number; name: string; stockStatus: string }[];
}

interface IngredientItem {
  id: number;
  name: string;
  unit: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED';
  notes?: string | null;
  dishes: { id: number; name: string; isOptional: boolean; isAvailable: boolean }[];
  dishesCount: number;
}

export default function ChefDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as { name?: string; role?: string } | undefined;

  const [tab, setTab] = useState<'menu' | 'ingredients'>('menu');
  const [dishes, setDishes] = useState<DishItem[]>([]);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<number | 'all'>('all');
  const [selectedDish, setSelectedDish] = useState<DishItem | null>(null);

  // Confirmation modal for marking out of stock
  const [pendingOutOfStock, setPendingOutOfStock] = useState<{
    ingredientId: number;
    name: string;
    affectedDishes: string[];
  } | null>(null);

  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  // Auth gate: chef, manager, owner
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/chef');
    } else if (status === 'authenticated') {
      const role = user?.role;
      if (role !== 'chef' && role !== 'manager' && role !== 'owner') {
        router.push('/');
      }
    }
  }, [status, user, router]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [menuRes, ingRes] = await Promise.all([
        apiFetch<{ items: DishItem[] }>('/api/inventory/menu'),
        apiFetch<{ ingredients: IngredientItem[] }>('/api/inventory/ingredients'),
      ]);
      setDishes(menuRes.items || []);
      setIngredients(ingRes.ingredients || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (status === 'authenticated') {
      const timer = setTimeout(() => {
        void loadData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [status, loadData]);

  // Unique categories
  const categories = useMemo(() => {
    const map = new Map<number, string>();
    dishes.forEach((d) => {
      if (d.category) map.set(d.category.id, d.category.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [dishes]);

  // Filtered dishes
  const filteredDishes = useMemo(() => {
    return dishes.filter((d) => {
      const matchesSearch =
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.recipe.some((r) => r.name.toLowerCase().includes(search.toLowerCase()));
      const matchesCat = selectedCatId === 'all' || d.category.id === selectedCatId;
      return matchesSearch && matchesCat;
    });
  }, [dishes, search, selectedCatId]);

  // Filtered ingredients
  const filteredIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      const q = search.toLowerCase();
      return (
        ing.name.toLowerCase().includes(q) ||
        ing.dishes.some((d) => d.name.toLowerCase().includes(q))
      );
    });
  }, [ingredients, search]);

  // Update ingredient stock status with optimistic UI
  const handleStockToggle = async (
    ingredientId: number,
    targetStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED'
  ) => {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;

    // If changing to OUT_OF_STOCK, trigger confirmation dialog if ingredient is used in dishes
    if (targetStatus === 'OUT_OF_STOCK' && ing.dishes.length > 0) {
      setPendingOutOfStock({
        ingredientId: ing.id,
        name: ing.name,
        affectedDishes: ing.dishes.map((d) => d.name),
      });
      return;
    }

    await applyStockChange(ingredientId, targetStatus);
  };

  const applyStockChange = async (
    ingredientId: number,
    targetStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED'
  ) => {
    const ing = ingredients.find((i) => i.id === ingredientId);
    const prevStatus = ing?.stockStatus;

    // Optimistic UI updates
    setIngredients((prev) =>
      prev.map((item) =>
        item.id === ingredientId ? { ...item, stockStatus: targetStatus } : item
      )
    );

    // Update inside selectedDish modal if open
    setSelectedDish((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        recipe: prev.recipe.map((r) =>
          r.ingredientId === ingredientId ? { ...r, stockStatus: targetStatus } : r
        ),
      };
    });

    try {
      await apiFetch<{
        success: boolean;
        affectedDishes: string[];
        alertCreated: boolean;
      }>(`/api/inventory/ingredients/${ingredientId}/status`, {
        method: 'POST',
        body: JSON.stringify({ stockStatus: targetStatus }),
      });

      showToast(
        targetStatus === 'OUT_OF_STOCK'
          ? `${ing?.name || 'Item'} marked Out of Stock. Manager alerted.`
          : targetStatus === 'ORDERED'
          ? `${ing?.name || 'Item'} marked as Ordered.`
          : `${ing?.name || 'Item'} is back In Stock!`
      );

      // Re-fetch to synchronize all dish availability derivations
      await loadData();

      // Refresh selectedDish if open
      if (selectedDish) {
        const refreshedDishes = await apiFetch<{ items: DishItem[] }>('/api/inventory/menu');
        const updated = refreshedDishes.items.find((d) => d.id === selectedDish.id);
        if (updated) setSelectedDish(updated);
      }
    } catch (err) {
      // Revert optimistic UI
      if (prevStatus) {
        setIngredients((prev) =>
          prev.map((item) =>
            item.id === ingredientId ? { ...item, stockStatus: prevStatus } : item
          )
        );
      }
      showToast(err instanceof Error ? err.message : 'Failed to update stock status');
    }
  };

  const statusBadge = (s: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ORDERED') => {
    if (s === 'IN_STOCK') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-leaf/15 text-leaf font-bold text-[12px]">
          <CheckCircle2 className="w-3.5 h-3.5" /> In stock
        </span>
      );
    }
    if (s === 'ORDERED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sun/30 text-ink font-bold text-[12px]">
          <Clock className="w-3.5 h-3.5" /> Ordered
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tomato/15 text-tomato font-bold text-[12px]">
        <XCircle className="w-3.5 h-3.5" /> Out of stock
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col font-sans pb-16">
      {/* Signature Gradient Header */}
      <header className="bg-signature-gradient rounded-b-[28px] px-5 sm:px-8 py-5 shadow-card">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-leaf text-surface flex items-center justify-center shadow-sm">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[22px] font-extrabold text-ink tracking-tight">Chef Inventory</span>
                <span className="px-2.5 py-0.5 rounded-full bg-ink text-sun-soft text-[11px] font-extrabold">
                  Kitchen Portal
                </span>
              </div>
              <p className="text-[12px] font-bold text-leaf">
                {user?.name || 'Chef Station'} • Ingredient Stock Control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/kitchen"
              className="min-h-[44px] px-4 rounded-[14px] bg-surface/80 hover:bg-surface text-leaf font-bold text-[13px] inline-flex items-center gap-1.5 transition border border-leaf/20"
            >
              <ArrowLeft className="w-4 h-4" /> KDS Tickets
            </Link>
            <Button
              variant="mint"
              onClick={loadData}
              className="min-h-[44px] px-3.5 text-[13px]"
              aria-label="Refresh stock data"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="leaf"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="min-h-[44px] px-3 text-[13px]"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="max-w-6xl mx-auto mt-5 flex gap-2 border-t border-leaf/10 pt-4">
          <button
            onClick={() => {
              setTab('menu');
              setSearch('');
            }}
            className={`min-h-[44px] px-5 rounded-full font-extrabold text-[14px] transition flex items-center gap-2 ${
              tab === 'menu'
                ? 'bg-sun text-ink shadow-sm'
                : 'bg-mint-bg text-leaf hover:bg-mint'
            }`}
          >
            <Layers className="w-4 h-4" /> Dishes & Recipes ({dishes.length})
          </button>
          <button
            onClick={() => {
              setTab('ingredients');
              setSearch('');
            }}
            className={`min-h-[44px] px-5 rounded-full font-extrabold text-[14px] transition flex items-center gap-2 ${
              tab === 'ingredients'
                ? 'bg-sun text-ink shadow-sm'
                : 'bg-mint-bg text-leaf hover:bg-mint'
            }`}
          >
            <PackageOpen className="w-4 h-4" /> All Ingredients ({ingredients.length})
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-8 py-6 space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'menu' ? 'Search dishes or ingredients...' : 'Search ingredients or dishes...'}
              className="w-full min-h-[44px] pl-10 pr-4 rounded-[14px] bg-surface border border-leaf/20 text-ink placeholder:text-muted/70 text-[14px] focus:outline-none focus:ring-2 focus:ring-leaf"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {tab === 'menu' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              <button
                onClick={() => setSelectedCatId('all')}
                className={`min-h-[38px] px-3.5 rounded-full text-[13px] font-bold whitespace-nowrap transition ${
                  selectedCatId === 'all'
                    ? 'bg-sun text-ink shadow-sm'
                    : 'bg-mint-bg text-leaf hover:bg-mint'
                }`}
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCatId(c.id)}
                  className={`min-h-[38px] px-3.5 rounded-full text-[13px] font-bold whitespace-nowrap transition ${
                    selectedCatId === c.id
                      ? 'bg-sun text-ink shadow-sm'
                      : 'bg-mint-bg text-leaf hover:bg-mint'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-[20px]" />
            ))}
          </div>
        )}

        {/* TAB A: DISHES & RECIPES */}
        {!loading && tab === 'menu' && (
          <div>
            {filteredDishes.length === 0 ? (
              <Card className="p-12 text-center text-muted">
                <ChefHat className="w-12 h-12 mx-auto text-muted/50 mb-3" />
                <p className="font-extrabold text-[16px] text-ink">No dishes matched your filter</p>
                <p className="text-[13px]">Try clearing your search query or select all categories.</p>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDishes.map((dish) => {
                  const outOfStockCount = dish.missingRequired.length;
                  const optionalMissingCount = dish.missingOptional.length;

                  return (
                    <Card
                      key={dish.id}
                      onClick={() => setSelectedDish(dish)}
                      className="p-5 flex flex-col justify-between hover:shadow-md transition cursor-pointer border border-leaf/10 hover:border-leaf/30 active:scale-[0.99]"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[12px] font-bold text-leaf">{dish.category.name}</span>
                            <h3 className="text-[16px] font-extrabold text-ink leading-snug">{dish.name}</h3>
                          </div>
                          <div>
                            {dish.isAvailable ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-leaf/15 text-leaf font-bold text-[12px]">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Available
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tomato/15 text-tomato font-bold text-[12px]">
                                <XCircle className="w-3.5 h-3.5" /> Unavailable
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Missing required ingredients alert banner */}
                        {outOfStockCount > 0 && (
                          <div className="p-2.5 rounded-[12px] bg-tomato/10 text-tomato text-[12px] font-bold space-y-1">
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 shrink-0" />
                              <span>Missing essential ingredient:</span>
                            </div>
                            <p className="font-normal pl-5">
                              {dish.missingRequired.map((m) => `${m.name} (${m.stockStatus.toLowerCase()})`).join(', ')}
                            </p>
                          </div>
                        )}

                        {/* Missing optional ingredient warning */}
                        {dish.isAvailable && optionalMissingCount > 0 && (
                          <div className="p-2 rounded-[12px] bg-sun/30 text-ink text-[12px] font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-leaf shrink-0" />
                            <span>Optional missing: {dish.missingOptional.map((m) => m.name).join(', ')}</span>
                          </div>
                        )}

                        {/* Recipe preview summary */}
                        <div className="pt-2 border-t border-leaf/10">
                          <p className="text-[12px] font-bold text-muted mb-1.5">
                            Recipe ({dish.recipe.length} ingredients):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {dish.recipe.slice(0, 4).map((r) => (
                              <span
                                key={r.id}
                                className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                                  r.stockStatus === 'IN_STOCK'
                                    ? 'bg-mint-bg text-leaf'
                                    : r.stockStatus === 'ORDERED'
                                    ? 'bg-sun/30 text-ink'
                                    : 'bg-tomato/15 text-tomato'
                                }`}
                              >
                                {r.name}
                                {r.isOptional ? ' (opt)' : ''}
                              </span>
                            ))}
                            {dish.recipe.length > 4 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-mint-bg text-muted font-bold">
                                +{dish.recipe.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-leaf/10 flex items-center justify-between text-[12px]">
                        <span className="text-muted font-bold">Tap to view / update stock</span>
                        <span className="text-leaf font-extrabold">Inspect Recipe →</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB B: ALL INGREDIENTS */}
        {!loading && tab === 'ingredients' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIngredients.map((ing) => (
                <Card key={ing.id} className="p-5 flex flex-col justify-between border border-leaf/10">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-[17px] font-extrabold text-ink">{ing.name}</h3>
                        <p className="text-[12px] text-muted font-bold">Unit: {ing.unit}</p>
                      </div>
                      {statusBadge(ing.stockStatus)}
                    </div>

                    {ing.notes && <p className="text-[12px] text-muted italic">&ldquo;{ing.notes}&rdquo;</p>}

                    {/* Affected Dishes list */}
                    <div className="pt-2 border-t border-leaf/10 space-y-1.5">
                      <p className="text-[12px] font-bold text-leaf">
                        Used in {ing.dishes.length} dish(es):
                      </p>
                      {ing.dishes.length === 0 ? (
                        <p className="text-[12px] text-muted italic">Not currently assigned to any dish.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {ing.dishes.map((d) => (
                            <span
                              key={d.id}
                              className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                                d.isAvailable ? 'bg-mint-bg text-leaf' : 'bg-tomato/15 text-tomato line-through'
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

                  {/* Stock Status Toggle Buttons (44px min tap targets) */}
                  <div className="mt-5 pt-3 border-t border-leaf/10 space-y-2">
                    <p className="text-[11px] font-extrabold text-muted uppercase tracking-wider">
                      Set Stock Status:
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => handleStockToggle(ing.id, 'IN_STOCK')}
                        disabled={ing.stockStatus === 'IN_STOCK'}
                        className={`min-h-[44px] px-2 rounded-[12px] font-extrabold text-[12px] transition ${
                          ing.stockStatus === 'IN_STOCK'
                            ? 'bg-leaf text-surface shadow-sm'
                            : 'bg-mint-bg text-leaf hover:bg-mint'
                        }`}
                      >
                        In Stock
                      </button>
                      <button
                        onClick={() => handleStockToggle(ing.id, 'ORDERED')}
                        disabled={ing.stockStatus === 'ORDERED'}
                        className={`min-h-[44px] px-2 rounded-[12px] font-extrabold text-[12px] transition ${
                          ing.stockStatus === 'ORDERED'
                            ? 'bg-sun text-ink shadow-sm'
                            : 'bg-mint-bg text-leaf hover:bg-mint'
                        }`}
                      >
                        Ordered
                      </button>
                      <button
                        onClick={() => handleStockToggle(ing.id, 'OUT_OF_STOCK')}
                        disabled={ing.stockStatus === 'OUT_OF_STOCK'}
                        className={`min-h-[44px] px-2 rounded-[12px] font-extrabold text-[12px] transition ${
                          ing.stockStatus === 'OUT_OF_STOCK'
                            ? 'bg-tomato text-surface shadow-sm'
                            : 'bg-tomato/15 text-tomato hover:bg-tomato/25'
                        }`}
                      >
                        Out of Stock
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* DISH DETAIL MODAL: RECIPE & INGREDIENT STATUS TOGGLE */}
      {selectedDish && (
        <Modal
          open={true}
          onClose={() => setSelectedDish(null)}
          title={selectedDish.name}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-leaf/10">
              <span className="text-[13px] font-bold text-leaf">{selectedDish.category.name}</span>
              <div>
                {selectedDish.isAvailable ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-leaf/15 text-leaf font-extrabold text-[13px]">
                    <CheckCircle2 className="w-4 h-4" /> Dish Available
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-tomato/15 text-tomato font-extrabold text-[13px]">
                    <XCircle className="w-4 h-4" /> Dish Unavailable
                  </span>
                )}
              </div>
            </div>

            {selectedDish.recipe.length === 0 ? (
              <p className="text-muted text-[13px] py-4 text-center">
                No recipe ingredients defined yet for this dish. (Managers can configure recipes in the Admin Dashboard).
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] font-extrabold text-ink">
                  Recipe Ingredients ({selectedDish.recipe.length}):
                </p>
                <div className="space-y-2.5">
                  {selectedDish.recipe.map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-[16px] bg-cream border border-leaf/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[15px] text-ink">{r.name}</span>
                          {r.isOptional && (
                            <span className="px-2 py-0.5 rounded-full bg-mint-bg text-leaf text-[11px] font-bold">
                              Optional
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-muted">
                          Serving qty:{' '}
                          {r.quantityPerServing != null ? `${r.quantityPerServing} ${r.unit}` : 'Standard portion'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {statusBadge(r.stockStatus)}
                        {/* Toggle button cycle */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleStockToggle(r.ingredientId, 'IN_STOCK')}
                            disabled={r.stockStatus === 'IN_STOCK'}
                            className={`min-h-[38px] px-3 rounded-[10px] text-[12px] font-extrabold ${
                              r.stockStatus === 'IN_STOCK' ? 'bg-leaf text-surface' : 'bg-surface text-leaf border border-leaf/20'
                            }`}
                          >
                            In
                          </button>
                          <button
                            onClick={() => handleStockToggle(r.ingredientId, 'ORDERED')}
                            disabled={r.stockStatus === 'ORDERED'}
                            className={`min-h-[38px] px-3 rounded-[10px] text-[12px] font-extrabold ${
                              r.stockStatus === 'ORDERED' ? 'bg-sun text-ink' : 'bg-surface text-ink border border-leaf/20'
                            }`}
                          >
                            Ordered
                          </button>
                          <button
                            onClick={() => handleStockToggle(r.ingredientId, 'OUT_OF_STOCK')}
                            disabled={r.stockStatus === 'OUT_OF_STOCK'}
                            className={`min-h-[38px] px-3 rounded-[10px] text-[12px] font-extrabold ${
                              r.stockStatus === 'OUT_OF_STOCK' ? 'bg-tomato text-surface' : 'bg-surface text-tomato border border-tomato/30'
                            }`}
                          >
                            Out
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-leaf/10 flex justify-end">
              <Button variant="mint" onClick={() => setSelectedDish(null)} className="min-h-[44px]">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CONFIRMATION MODAL WHEN MARKING AN INGREDIENT OUT OF STOCK */}
      {pendingOutOfStock && (
        <Modal
          open={true}
          onClose={() => setPendingOutOfStock(null)}
          title={`Mark "${pendingOutOfStock.name}" Out of Stock?`}
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-[16px] bg-tomato/10 text-tomato text-[13px] font-bold flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p>This will automatically create a stock alert for managers and mark affected dishes as unavailable to guests.</p>
              </div>
            </div>

            {pendingOutOfStock.affectedDishes.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-extrabold text-ink">
                  &ldquo;{pendingOutOfStock.name}&rdquo; is used in {pendingOutOfStock.affectedDishes.length} dish(es):
                </p>
                <div className="p-3 rounded-[14px] bg-cream border border-leaf/10 max-h-40 overflow-y-auto space-y-1">
                  {pendingOutOfStock.affectedDishes.map((dishName) => (
                    <div key={dishName} className="text-[13px] font-bold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-tomato shrink-0" />
                      <span>{dishName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-leaf/10 flex justify-end gap-2.5">
              <Button
                variant="mint"
                onClick={() => setPendingOutOfStock(null)}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                variant="tomato"
                onClick={async () => {
                  const target = pendingOutOfStock;
                  setPendingOutOfStock(null);
                  await applyStockChange(target.ingredientId, 'OUT_OF_STOCK');
                }}
                className="min-h-[44px] px-5"
              >
                Confirm Out of Stock
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <Toast message={toast} />
    </div>
  );
}
