import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { requireStaffAuth } from '@/lib/auth-guard';
import { evaluateDishAvailability } from '@/lib/inventory/availability';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const staff = await requireStaffAuth(['chef', 'manager', 'owner']);
    const isManagerOrOwner = staff.role === 'manager' || staff.role === 'owner';

    const searchParams = req.nextUrl.searchParams;
    const includeArchived = isManagerOrOwner && searchParams.get('includeArchived') === 'true';

    const items = await prisma.menuItem.findMany({
      where: includeArchived ? undefined : { archivedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        station: { select: { id: true, name: true, code: true } },
        variants: true,
        recipeItems: {
          include: {
            ingredient: true,
          },
          orderBy: [{ isOptional: 'asc' }, { ingredient: { name: 'asc' } }],
        },
      },
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    });

    const enriched = items.map((item) => {
      const avail = evaluateDishAvailability(item);
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        basePricePaise: isManagerOrOwner ? item.basePricePaise : item.basePricePaise, // Chef can see price if needed, but not costs
        isVeg: item.isVeg,
        spiceLevel: item.spiceLevel,
        allergens: item.allergens,
        prepTimeMins: item.prepTimeMins,
        isAvailable: avail.isAvailable,
        hasOptionalWarning: avail.hasOptionalWarning,
        isOverridden: avail.isOverridden,
        overrideReason: avail.overrideReason,
        archivedAt: item.archivedAt,
        category: item.category,
        station: item.station,
        variants: item.variants,
        missingRequired: avail.missingRequiredIngredients,
        missingOptional: avail.missingOptionalIngredients,
        recipe: item.recipeItems.map((r) => ({
          id: r.id,
          ingredientId: r.ingredientId,
          name: r.ingredient.name,
          stockStatus: r.ingredient.stockStatus,
          quantityPerServing: r.quantityPerServing ? Number(r.quantityPerServing) : null,
          unit: r.unit,
          isOptional: r.isOptional,
        })),
      };
    });

    return NextResponse.json({ items: enriched });
  } catch (err) {
    return handleApiError(err);
  }
}
