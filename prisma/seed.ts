import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, RoleName, SpiceLevel, StationCode } from '@prisma/client';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

async function main() {
  // 1. Roles
  const roleDefs: { name: RoleName; description: string }[] = [
    { name: 'owner', description: 'Restaurant owner and full administrator' },
    { name: 'manager', description: 'Floor manager, menu & table supervisor' },
    { name: 'waiter', description: 'Table service, order confirmation, and waiter calls' },
    { name: 'chef', description: 'Kitchen Display System operator' },
  ];

  const roleMap: Record<string, number> = {};
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: r,
    });
    roleMap[r.name] = role.id;
  }

  // 2. Demo Staff Accounts (strong random passwords printed ONCE)
  const staffDefs: { name: string; email: string; role: RoleName }[] = [
    { name: 'Aarav Sharma (Owner)', email: 'owner@tableflow.local', role: 'owner' },
    { name: 'Meera Nair (Manager)', email: 'manager@tableflow.local', role: 'manager' },
    { name: 'Rohan Verma (Waiter)', email: 'waiter@tableflow.local', role: 'waiter' },
    { name: 'Kabir Patel (Chef)', email: 'chef@tableflow.local', role: 'chef' },
  ];

  const createdCredentials: { role: string; email: string; password: string }[] = [];
  for (const s of staffDefs) {
    const existing = await prisma.user.findUnique({ where: { email: s.email } });
    if (!existing) {
      const plainPassword = `Tf!${crypto.randomBytes(9).toString('base64url')}`;
      const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_COST);
      await prisma.user.create({
        data: {
          name: s.name,
          email: s.email,
          passwordHash,
          roleId: roleMap[s.role],
          isActive: true,
        },
      });
      createdCredentials.push({ role: s.role, email: s.email, password: plainPassword });
    }
  }

  // 3. Kitchen Stations
  const stationDefs: { name: string; code: StationCode; displayOrder: number }[] = [
    { name: 'Tandoor & Grill', code: 'grill', displayOrder: 1 },
    { name: 'Fry & Wok', code: 'fry', displayOrder: 2 },
    { name: 'Bar & Beverages', code: 'drinks', displayOrder: 3 },
    { name: 'Pastry & Desserts', code: 'dessert', displayOrder: 4 },
  ];

  const stationMap: Record<string, number> = {};
  for (const st of stationDefs) {
    const station = await prisma.kitchenStation.upsert({
      where: { code: st.code },
      update: {},
      create: st,
    });
    stationMap[st.code] = station.id;
  }

  // 4. Categories
  const categoryDefs = [
    { name: 'Starters & Grills', slug: 'starters-grills', description: 'Charcoal-kissed appetizers & crispy bites', sortOrder: 1 },
    { name: 'Signature Mains', slug: 'signature-mains', description: 'Slow-cooked curries, bowls & platters', sortOrder: 2 },
    { name: 'Artisan Breads & Rice', slug: 'breads-rice', description: 'Clay-oven naan and fragrant biryanis', sortOrder: 3 },
    { name: 'Craft Drinks', slug: 'craft-drinks', description: 'Fresh coolers, mocktails & coffees', sortOrder: 4 },
    { name: 'Desserts', slug: 'desserts', description: 'Handcrafted sweet finishes', sortOrder: 5 },
  ];

  const categoryMap: Record<string, number> = {};
  for (const c of categoryDefs) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
    categoryMap[c.slug] = cat.id;
  }

  // 5. Menu Items + Variants
  const menuDefs: {
    category: string;
    station: StationCode;
    name: string;
    description: string;
    imageUrl: string;
    basePricePaise: number;
    isVeg: boolean;
    spiceLevel: SpiceLevel;
    allergens: string[];
    prepTimeMins: number;
    variants: { name: string; priceDeltaPaise: number; isDefault: boolean }[];
  }[] = [
    {
      category: 'starters-grills',
      station: 'grill',
      name: 'Smoked Paneer Tikka',
      description: 'Cottage cheese marinated in hung curd, Kashmiri chilli, and char-grilled bell peppers.',
      imageUrl: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&q=80',
      basePricePaise: 32000,
      isVeg: true,
      spiceLevel: 'medium',
      allergens: ['Dairy'],
      prepTimeMins: 15,
      variants: [
        { name: 'Regular (6 pcs)', priceDeltaPaise: 0, isDefault: true },
        { name: 'Platter (10 pcs)', priceDeltaPaise: 14000, isDefault: false },
      ],
    },
    {
      category: 'starters-grills',
      station: 'fry',
      name: 'Crispy Lotus Stem Honey Chilli',
      description: 'Wok-tossed crunchy lotus stem glazed with toasted sesame and bird-eye chilli.',
      imageUrl: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=600&q=80',
      basePricePaise: 29000,
      isVeg: true,
      spiceLevel: 'hot',
      allergens: ['Sesame', 'Soy'],
      prepTimeMins: 12,
      variants: [
        { name: 'Regular', priceDeltaPaise: 0, isDefault: true },
        { name: 'Shareable Bowl', priceDeltaPaise: 11000, isDefault: false },
      ],
    },
    {
      category: 'starters-grills',
      station: 'grill',
      name: 'Peri-Peri Charred Chicken Skewers',
      description: 'Tender chicken thighs brushed with house peri-peri butter and lime.',
      imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80',
      basePricePaise: 38000,
      isVeg: false,
      spiceLevel: 'hot',
      allergens: ['Dairy'],
      prepTimeMins: 16,
      variants: [
        { name: 'Half (4 skewers)', priceDeltaPaise: 0, isDefault: true },
        { name: 'Full (8 skewers)', priceDeltaPaise: 22000, isDefault: false },
      ],
    },
    {
      category: 'signature-mains',
      station: 'grill',
      name: 'Velvet Butter Chicken',
      description: 'Tandoori chicken simmered in smoky tomato-fenugreek makhani gravy.',
      imageUrl: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80',
      basePricePaise: 46000,
      isVeg: false,
      spiceLevel: 'mild',
      allergens: ['Dairy', 'Cashew'],
      prepTimeMins: 18,
      variants: [
        { name: 'Regular', priceDeltaPaise: 0, isDefault: true },
        { name: 'Family Bowl', priceDeltaPaise: 20000, isDefault: false },
      ],
    },
    {
      category: 'signature-mains',
      station: 'grill',
      name: 'Dal TableFlow (24-Hr Black Lentils)',
      description: 'Slow-simmered urad dal finished with white butter and roasted garlic.',
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80',
      basePricePaise: 36000,
      isVeg: true,
      spiceLevel: 'mild',
      allergens: ['Dairy'],
      prepTimeMins: 14,
      variants: [
        { name: 'Regular', priceDeltaPaise: 0, isDefault: true },
        { name: 'Large', priceDeltaPaise: 13000, isDefault: false },
      ],
    },
    {
      category: 'signature-mains',
      station: 'fry',
      name: 'Dal Tadka (Homestyle Yellow Lentils)',
      description: 'Yellow lentils tempered with ghee, cumin, crisped garlic, and Kashmiri chilli.',
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80',
      basePricePaise: 32000,
      isVeg: true,
      spiceLevel: 'medium',
      allergens: ['Dairy'],
      prepTimeMins: 12,
      variants: [
        { name: 'Regular', priceDeltaPaise: 0, isDefault: true },
        { name: 'Large', priceDeltaPaise: 11000, isDefault: false },
      ],
    },
    {
      category: 'signature-mains',
      station: 'fry',
      name: 'Truffle Mushroom Risotto',
      description: 'Creamy Arborio rice with roasted shiitake, parmesan crisp, and black truffle oil.',
      imageUrl: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600&q=80',
      basePricePaise: 49000,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Dairy'],
      prepTimeMins: 20,
      variants: [{ name: 'Standard', priceDeltaPaise: 0, isDefault: true }],
    },
    {
      category: 'breads-rice',
      station: 'grill',
      name: 'Garlic & Herb Butter Naan',
      description: 'Blistered sourdough naan brushed with roasted garlic butter.',
      imageUrl: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&q=80',
      basePricePaise: 9500,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Gluten', 'Dairy'],
      prepTimeMins: 7,
      variants: [
        { name: 'Single', priceDeltaPaise: 0, isDefault: true },
        { name: 'Basket of 3', priceDeltaPaise: 16500, isDefault: false },
      ],
    },
    {
      category: 'breads-rice',
      station: 'grill',
      name: 'Awadhi Subz Dum Biryani',
      description: 'Aged basmati layered with saffron, seasonal vegetables, and mint raita.',
      imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',
      basePricePaise: 41000,
      isVeg: true,
      spiceLevel: 'medium',
      allergens: ['Dairy', 'Nuts'],
      prepTimeMins: 18,
      variants: [{ name: 'Handi (Serves 1-2)', priceDeltaPaise: 0, isDefault: true }],
    },
    {
      category: 'craft-drinks',
      station: 'drinks',
      name: 'Kala Khatta Mint Cooler',
      description: 'Tangy jamun reduction muddled with fresh mint, black salt, and sparkling soda.',
      imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80',
      basePricePaise: 16000,
      isVeg: true,
      spiceLevel: 'none',
      allergens: [],
      prepTimeMins: 5,
      variants: [
        { name: 'Regular (300ml)', priceDeltaPaise: 0, isDefault: true },
        { name: 'Pitcher (1L)', priceDeltaPaise: 28000, isDefault: false },
      ],
    },
    {
      category: 'craft-drinks',
      station: 'drinks',
      name: 'Single-Origin Iced Cold Brew',
      description: '18-hour Chikmagalur cold brew over crystal ice with optional oat milk.',
      imageUrl: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=80',
      basePricePaise: 19500,
      isVeg: true,
      spiceLevel: 'none',
      allergens: [],
      prepTimeMins: 4,
      variants: [
        { name: 'Black', priceDeltaPaise: 0, isDefault: true },
        { name: 'With Oat Milk', priceDeltaPaise: 4000, isDefault: false },
      ],
    },
    {
      category: 'desserts',
      station: 'dessert',
      name: 'Belgian Dark Chocolate Fondant',
      description: 'Warm molten 70% dark chocolate cake served with Madagascar vanilla bean gelato.',
      imageUrl: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=600&q=80',
      basePricePaise: 28000,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Gluten', 'Dairy', 'Eggs'],
      prepTimeMins: 12,
      variants: [{ name: 'Single Serve', priceDeltaPaise: 0, isDefault: true }],
    },
    {
      category: 'desserts',
      station: 'dessert',
      name: 'Saffron Pistachio Tres Leches',
      description: 'Cardamom-infused milk sponge topped with saffron cream and roasted pistachios.',
      imageUrl: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&q=80',
      basePricePaise: 26000,
      isVeg: true,
      spiceLevel: 'none',
      allergens: ['Gluten', 'Dairy', 'Nuts'],
      prepTimeMins: 6,
      variants: [{ name: 'Slice', priceDeltaPaise: 0, isDefault: true }],
    },
  ];

  for (const m of menuDefs) {
    const existing = await prisma.menuItem.findUnique({ where: { name: m.name } });
    if (!existing) {
      await prisma.menuItem.create({
        data: {
          categoryId: categoryMap[m.category],
          stationId: stationMap[m.station],
          name: m.name,
          description: m.description,
          imageUrl: m.imageUrl,
          basePricePaise: m.basePricePaise,
          isVeg: m.isVeg,
          spiceLevel: m.spiceLevel,
          allergens: m.allergens,
          isAvailable: true,
          prepTimeMins: m.prepTimeMins,
          variants: {
            create: m.variants.map((v) => ({
              name: v.name,
              priceDeltaPaise: v.priceDeltaPaise,
              isDefault: v.isDefault,
              isAvailable: true,
            })),
          },
        },
      });
    }
  }

  // 6. Deals
  await prisma.deal.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      title: '10% Off Orders Above ₹499',
      description: 'Enjoy 10% savings on dine-in orders of ₹499 or more.',
      code: 'WELCOME10',
      discountType: 'percent',
      discountValue: 10,
      minOrderPaise: 49900,
      isActive: true,
    },
  });

  await prisma.deal.upsert({
    where: { code: 'FLAT100' },
    update: {},
    create: {
      title: 'Flat ₹100 Off Orders Above ₹899',
      description: 'Flat ₹100 instant discount on group orders above ₹899.',
      code: 'FLAT100',
      discountType: 'flat_paise',
      discountValue: 10000,
      minOrderPaise: 89900,
      isActive: true,
    },
  });

  // 7. 10 Tables with 256-bit unguessable QR tokens
  const zones = ['Main Hall', 'Main Hall', 'Main Hall', 'Main Hall', 'Window Side', 'Window Side', 'Patio', 'Patio', 'Lounge', 'Lounge'];
  const capacities = [2, 4, 4, 6, 2, 4, 4, 6, 4, 8];
  const createdTables: { table: string; qrToken: string }[] = [];

  for (let i = 1; i <= 10; i++) {
    const tableNumber = `T${i}`;
    const existing = await prisma.table.findUnique({ where: { tableNumber } });
    if (!existing) {
      const tbl = await prisma.table.create({
        data: {
          tableNumber,
          label: `Table ${i}`,
          capacity: capacities[i - 1],
          zone: zones[i - 1],
          qrToken: crypto.randomBytes(32).toString('base64url'),
          status: 'free',
          isActive: true,
        },
      });
      createdTables.push({ table: tableNumber, qrToken: tbl.qrToken });
    }
  }

  const firstTable = await prisma.table.findUnique({ where: { tableNumber: 'T1' } });

  // 8. Demo Ingredients & Inventory
  const ingredientDefs = [
    { name: 'Dal (Lentils)', unit: 'kg' as const, notes: 'Premium black urad and toor lentils' },
    { name: 'Dairy Butter', unit: 'kg' as const, notes: 'Rich artisanal churned white butter' },
    { name: 'Tomato Puree', unit: 'kg' as const, notes: 'Vine-ripened simmered tomato reduction' },
    { name: 'Garlic', unit: 'kg' as const, notes: 'Peeled fresh organic garlic cloves' },
    { name: 'Fresh Cream', unit: 'l' as const, notes: 'Thick dairy cream for finishes' },
    { name: 'Paneer', unit: 'kg' as const, notes: 'Farm-fresh Malai cottage cheese' },
    { name: 'Basmati Rice', unit: 'kg' as const, notes: 'Extra long grain aged dehradun basmati' },
    { name: 'Chicken', unit: 'kg' as const, notes: 'Free-range fresh boneless chicken thighs' },
    { name: 'Flour (Maida)', unit: 'kg' as const, notes: 'Fine wheat flour for tandoor breads' },
    { name: 'Lotus Stem', unit: 'kg' as const, notes: 'Crispy nadru stems' },
    { name: 'Coffee Beans', unit: 'kg' as const, notes: 'Chikmagalur shade-grown arabica' },
    { name: 'Dark Chocolate', unit: 'kg' as const, notes: '70% Belgian callets' },
  ];

  const ingredientMap: Record<string, number> = {};
  for (const ing of ingredientDefs) {
    const record = await prisma.ingredient.upsert({
      where: { name: ing.name },
      update: {},
      create: {
        name: ing.name,
        unit: ing.unit,
        stockStatus: 'IN_STOCK',
        notes: ing.notes,
        currentStock: 50,
        lowStockThreshold: 10,
      },
    });
    ingredientMap[ing.name] = record.id;
  }

  // 9. Recipes (Shared Ingredients: Dal TableFlow & Dal Tadka both share "Dal (Lentils)")
  const dalMakhni = await prisma.menuItem.findUnique({ where: { name: 'Dal TableFlow (24-Hr Black Lentils)' } });
  const dalTadka = await prisma.menuItem.findUnique({ where: { name: 'Dal Tadka (Homestyle Yellow Lentils)' } });
  const paneerTikka = await prisma.menuItem.findUnique({ where: { name: 'Smoked Paneer Tikka' } });
  const butterChicken = await prisma.menuItem.findUnique({ where: { name: 'Velvet Butter Chicken' } });
  const butterNaan = await prisma.menuItem.findUnique({ where: { name: 'Garlic & Herb Butter Naan' } });

  const recipeConfigs: { menuItemId: number; ingredientName: string; isOptional: boolean; qty: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'pcs' }[] = [];

  if (dalMakhni) {
    recipeConfigs.push(
      { menuItemId: dalMakhni.id, ingredientName: 'Dal (Lentils)', isOptional: false, qty: 120, unit: 'g' },
      { menuItemId: dalMakhni.id, ingredientName: 'Dairy Butter', isOptional: false, qty: 30, unit: 'g' },
      { menuItemId: dalMakhni.id, ingredientName: 'Tomato Puree', isOptional: false, qty: 50, unit: 'g' },
      { menuItemId: dalMakhni.id, ingredientName: 'Garlic', isOptional: false, qty: 10, unit: 'g' },
      { menuItemId: dalMakhni.id, ingredientName: 'Fresh Cream', isOptional: true, qty: 20, unit: 'ml' }
    );
  }

  if (dalTadka) {
    recipeConfigs.push(
      // SHARED INGREDIENT: "Dal (Lentils)" is shared with Dal TableFlow!
      { menuItemId: dalTadka.id, ingredientName: 'Dal (Lentils)', isOptional: false, qty: 100, unit: 'g' },
      { menuItemId: dalTadka.id, ingredientName: 'Dairy Butter', isOptional: false, qty: 20, unit: 'g' },
      { menuItemId: dalTadka.id, ingredientName: 'Tomato Puree', isOptional: false, qty: 40, unit: 'g' },
      { menuItemId: dalTadka.id, ingredientName: 'Garlic', isOptional: false, qty: 15, unit: 'g' }
    );
  }

  if (paneerTikka) {
    recipeConfigs.push(
      { menuItemId: paneerTikka.id, ingredientName: 'Paneer', isOptional: false, qty: 180, unit: 'g' },
      { menuItemId: paneerTikka.id, ingredientName: 'Dairy Butter', isOptional: false, qty: 15, unit: 'g' }
    );
  }

  if (butterChicken) {
    recipeConfigs.push(
      { menuItemId: butterChicken.id, ingredientName: 'Chicken', isOptional: false, qty: 220, unit: 'g' },
      { menuItemId: butterChicken.id, ingredientName: 'Dairy Butter', isOptional: false, qty: 35, unit: 'g' },
      { menuItemId: butterChicken.id, ingredientName: 'Tomato Puree', isOptional: false, qty: 60, unit: 'g' },
      { menuItemId: butterChicken.id, ingredientName: 'Fresh Cream', isOptional: false, qty: 30, unit: 'ml' }
    );
  }

  if (butterNaan) {
    recipeConfigs.push(
      { menuItemId: butterNaan.id, ingredientName: 'Flour (Maida)', isOptional: false, qty: 90, unit: 'g' },
      { menuItemId: butterNaan.id, ingredientName: 'Dairy Butter', isOptional: false, qty: 20, unit: 'g' },
      { menuItemId: butterNaan.id, ingredientName: 'Garlic', isOptional: false, qty: 8, unit: 'g' }
    );
  }

  for (const rc of recipeConfigs) {
    const ingId = ingredientMap[rc.ingredientName];
    if (ingId) {
      await prisma.recipeItem.upsert({
        where: {
          menuItemId_ingredientId: {
            menuItemId: rc.menuItemId,
            ingredientId: ingId,
          },
        },
        update: {
          isOptional: rc.isOptional,
          quantityPerServing: rc.qty,
          unit: rc.unit,
        },
        create: {
          menuItemId: rc.menuItemId,
          ingredientId: ingId,
          isOptional: rc.isOptional,
          quantityPerServing: rc.qty,
          unit: rc.unit,
        },
      });
    }
  }

  // 10. Demo Purchases for Reports (Recorded by Manager)
  const managerUser = await prisma.user.findUnique({ where: { email: 'manager@tableflow.local' } });
  if (managerUser) {
    const existingPurchases = await prisma.purchase.count();
    if (existingPurchases === 0) {
      const demoPurchases = [
        {
          ingredientName: 'Dal (Lentils)',
          quantity: 25,
          unit: 'kg' as const,
          totalCost: 325000, // ₹3,250.00
          supplier: 'Metro Wholesale Cash & Carry',
          daysAgo: 4,
        },
        {
          ingredientName: 'Dairy Butter',
          quantity: 12,
          unit: 'kg' as const,
          totalCost: 624000, // ₹6,240.00
          supplier: 'Amul Dairy Distribution',
          daysAgo: 3,
        },
        {
          ingredientName: 'Paneer',
          quantity: 10,
          unit: 'kg' as const,
          totalCost: 380000, // ₹3,800.00
          supplier: 'Verka Fresh Depot',
          daysAgo: 2,
        },
        {
          ingredientName: 'Chicken',
          quantity: 15,
          unit: 'kg' as const,
          totalCost: 450000, // ₹4,500.00
          supplier: 'Supreme Poultry Farms',
          daysAgo: 1,
        },
      ];

      for (const p of demoPurchases) {
        const ingId = ingredientMap[p.ingredientName];
        if (ingId) {
          const pDate = new Date(Date.now() - p.daysAgo * 86400000);
          await prisma.purchase.create({
            data: {
              ingredientId: ingId,
              quantity: p.quantity,
              unit: p.unit,
              totalCost: p.totalCost,
              supplier: p.supplier,
              notes: 'Regular kitchen stock replenishment',
              purchasedById: managerUser.id,
              purchasedAt: pDate,
              receivedAt: pDate,
            },
          });
        }
      }
    }
  }

  console.log('\n=== TableFlow Postgres Seed Completed ===');
  if (createdCredentials.length > 0) {
    console.log('\nGenerated Staff Credentials (printed ONCE — save securely):');
    for (const c of createdCredentials) {
      console.log(`  [${c.role.toUpperCase()}] ${c.email}  |  password: ${c.password}`);
    }
  } else {
    console.log('Staff accounts already exist (passwords preserved).');
  }
  if (firstTable) {
    console.log(`\nSample Table T1 URL: /t/${firstTable.qrToken}`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

