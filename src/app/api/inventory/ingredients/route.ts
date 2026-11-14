import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { AppError, handleApiError } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/audit';
import { requireStaffAuth, withStaffAuth } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { sanitizeUserText } from '@/lib/sanitize';
import { createIngredientSchema, parseJsonBody } from '@/lib/validators';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireStaffAuth(['chef', 'manager', 'owner']);

    const ingredients = await prisma.ingredient.findMany({
      where: { archivedAt: null },
      include: {
        recipeItems: {
          where: { menuItem: { archivedAt: null } },
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                isAvailable: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const formatted = ingredients.map((ing) => ({
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      stockStatus: ing.stockStatus,
      notes: ing.notes,
      currentStock: ing.currentStock ? Number(ing.currentStock) : 0,
      lowStockThreshold: ing.lowStockThreshold ? Number(ing.lowStockThreshold) : 0,
      dishes: ing.recipeItems.map((r) => ({
        id: r.menuItem.id,
        name: r.menuItem.name,
        isOptional: r.isOptional,
        isAvailable: r.menuItem.isAvailable,
      })),
      dishesCount: ing.recipeItems.length,
    }));

    return NextResponse.json({ ingredients: formatted });
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = withStaffAuth(['manager', 'owner'], async (req, { actor: staff }) => {
  const body = await parseJsonBody(req, createIngredientSchema);

  const existing = await prisma.ingredient.findUnique({
    where: { name: body.name },
  });

  if (existing) {
    if (existing.archivedAt) {
      // Unarchive
      const restored = await prisma.ingredient.update({
        where: { id: existing.id },
        data: {
          archivedAt: null,
          unit: body.unit,
          notes: body.notes ? sanitizeUserText(body.notes, 500) : existing.notes,
          stockStatus: body.stockStatus || 'IN_STOCK',
        },
      });
      return NextResponse.json({ ingredient: restored });
    }
    throw new AppError(409, `Ingredient "${body.name}" already exists.`, 'DUPLICATE_INGREDIENT');
  }

  const ingredient = await prisma.ingredient.create({
    data: {
      name: body.name,
      unit: body.unit,
      stockStatus: body.stockStatus || 'IN_STOCK',
      currentStock:
        body.currentStock != null ? new Prisma.Decimal(body.currentStock) : new Prisma.Decimal(0),
      lowStockThreshold:
        body.lowStockThreshold != null
          ? new Prisma.Decimal(body.lowStockThreshold)
          : new Prisma.Decimal(0),
      notes: body.notes ? sanitizeUserText(body.notes, 500) : null,
    },
  });

  await recordAuditLog({
    actorUserId: staff.id,
    actorRole: staff.role,
    action: 'INGREDIENT_CREATED',
    entityType: 'Ingredient',
    entityId: ingredient.id,
    metadata: { name: ingredient.name, unit: ingredient.unit },
  });

  return NextResponse.json({ ingredient }, { status: 201 });
});
