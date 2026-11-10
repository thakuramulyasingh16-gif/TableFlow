import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getSequelize } from '../config/database.js';
import { defineModels } from './models/index.js';
import { runMigrations } from './migrate.js';
import { generateOpaqueToken } from '../utils/crypto.js';

const BCRYPT_COST = 12;

export async function seedDatabase(sequelize = getSequelize()) {
  await runMigrations(sequelize);
  const models = defineModels(sequelize);

  // 1. Roles
  const roleDefs = [
    { name: 'owner', description: 'Full restaurant owner and system administrator' },
    { name: 'manager', description: 'Floor manager, menu & table supervisor' },
    { name: 'waiter', description: 'Table service, order confirmation, and waiter calls' },
    { name: 'chef', description: 'Kitchen Display System operator' },
  ];
  const roleMap = {};
  for (const r of roleDefs) {
    const [role] = await models.Role.findOrCreate({
      where: { name: r.name },
      defaults: r,
    });
    roleMap[r.name] = role;
  }

  // 2. Demo Staff Accounts (strong random passwords printed once if created)
  const staffDefs = [
    { name: 'Aarav Sharma (Owner)', email: 'owner@tableflow.local', role: 'owner' },
    { name: 'Meera Nair (Manager)', email: 'manager@tableflow.local', role: 'manager' },
    { name: 'Rohan Verma (Waiter)', email: 'waiter@tableflow.local', role: 'waiter' },
    { name: 'Kabir Patel (Chef)', email: 'chef@tableflow.local', role: 'chef' },
  ];

  const createdCredentials = [];
  for (const s of staffDefs) {
    const existing = await models.User.findOne({ where: { email: s.email } });
    if (!existing) {
      const plainPassword = `Tf!${crypto.randomBytes(9).toString('base64url')}`;
      const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_COST);
      await models.User.create({
        name: s.name,
        email: s.email,
        password_hash: passwordHash,
        role_id: roleMap[s.role].id,
        is_active: true,
      });
      createdCredentials.push({ role: s.role, email: s.email, password: plainPassword });
    }
  }

  // 3. Kitchen Stations
  const stationDefs = [
    { name: 'Tandoor & Grill', code: 'grill', display_order: 1 },
    { name: 'Fry & Wok', code: 'fry', display_order: 2 },
    { name: 'Bar & Beverages', code: 'drinks', display_order: 3 },
    { name: 'Pastry & Desserts', code: 'dessert', display_order: 4 },
  ];
  const stationMap = {};
  for (const st of stationDefs) {
    const [station] = await models.KitchenStation.findOrCreate({
      where: { code: st.code },
      defaults: st,
    });
    stationMap[st.code] = station;
  }

  // 4. Categories
  const categoryDefs = [
    { name: 'Starters & Grills', slug: 'starters-grills', description: 'Charcoal-kissed appetizers & crispy bites', sort_order: 1 },
    { name: 'Signature Mains', slug: 'signature-mains', description: 'Slow-cooked curries, bowls & platters', sort_order: 2 },
    { name: 'Artisan Breads & Rice', slug: 'breads-rice', description: 'Clay-oven naan and fragrant biryanis', sort_order: 3 },
    { name: 'Craft Drinks', slug: 'craft-drinks', description: 'Fresh coolers, mocktails & coffees', sort_order: 4 },
    { name: 'Desserts', slug: 'desserts', description: 'Handcrafted sweet finishes', sort_order: 5 },
  ];
  const categoryMap = {};
  for (const c of categoryDefs) {
    const [cat] = await models.Category.findOrCreate({
      where: { slug: c.slug },
      defaults: c,
    });
    categoryMap[c.slug] = cat;
  }

  // 5. Menu Items + Variants
  const menuDefs = [
    {
      category: 'starters-grills',
      station: 'grill',
      name: 'Smoked Paneer Tikka',
      description: 'Cottage cheese marinated in hung curd, Kashmiri chilli, and char-grilled bell peppers.',
      image_url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&q=80',
      base_price_paise: 32000,
      is_veg: true,
      spice_level: 'medium',
      allergens: ['Dairy'],
      prep_time_mins: 15,
      variants: [
        { name: 'Regular (6 pcs)', price_delta_paise: 0, is_default: true },
        { name: 'Platter (10 pcs)', price_delta_paise: 14000, is_default: false },
      ],
    },
    {
      category: 'starters-grills',
      station: 'fry',
      name: 'Crispy Lotus Stem Honey Chilli',
      description: 'Wok-tossed crunchy lotus stem glazed with toasted sesame and bird-eye chilli.',
      image_url: 'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=600&q=80',
      base_price_paise: 29000,
      is_veg: true,
      spice_level: 'hot',
      allergens: ['Sesame', 'Soy'],
      prep_time_mins: 12,
      variants: [
        { name: 'Regular', price_delta_paise: 0, is_default: true },
        { name: 'Shareable Bowl', price_delta_paise: 11000, is_default: false },
      ],
    },
    {
      category: 'starters-grills',
      station: 'grill',
      name: 'Peri-Peri Charred Chicken Skewers',
      description: 'Tender chicken thighs brushed with house peri-peri butter and lime.',
      image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80',
      base_price_paise: 38000,
      is_veg: false,
      spice_level: 'hot',
      allergens: ['Dairy'],
      prep_time_mins: 16,
      variants: [
        { name: 'Half (4 skewers)', price_delta_paise: 0, is_default: true },
        { name: 'Full (8 skewers)', price_delta_paise: 22000, is_default: false },
      ],
    },
    {
      category: 'signature-mains',
      station: 'grill',
      name: 'Velvet Butter Chicken',
      description: 'Tandoori chicken simmered in smoky tomato-fenugreek makhani gravy.',
      image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80',
      base_price_paise: 46000,
      is_veg: false,
      spice_level: 'mild',
      allergens: ['Dairy', 'Cashew'],
      prep_time_mins: 18,
      variants: [
        { name: 'Regular', price_delta_paise: 0, is_default: true },
        { name: 'Family Bowl', price_delta_paise: 20000, is_default: false },
      ],
    },
    {
      category: 'signature-mains',
      station: 'grill',
      name: 'Dal TableFlow (24-Hr Black Lentils)',
      description: 'Slow-simmered urad dal finished with white butter and roasted garlic.',
      image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80',
      base_price_paise: 36000,
      is_veg: true,
      spice_level: 'mild',
      allergens: ['Dairy'],
      prep_time_mins: 14,
      variants: [
        { name: 'Regular', price_delta_paise: 0, is_default: true },
        { name: 'Large', price_delta_paise: 13000, is_default: false },
      ],
    },
    {
      category: 'signature-mains',
      station: 'fry',
      name: 'Truffle Mushroom Risotto',
      description: 'Creamy Arborio rice with roasted shiitake, parmesan crisp, and black truffle oil.',
      image_url: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600&q=80',
      base_price_paise: 49000,
      is_veg: true,
      spice_level: 'none',
      allergens: ['Dairy'],
      prep_time_mins: 20,
      variants: [{ name: 'Standard', price_delta_paise: 0, is_default: true }],
    },
    {
      category: 'breads-rice',
      station: 'grill',
      name: 'Garlic & Herb Butter Naan',
      description: 'Blistered sourdough naan brushed with roasted garlic butter.',
      image_url: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&q=80',
      base_price_paise: 9500,
      is_veg: true,
      spice_level: 'none',
      allergens: ['Gluten', 'Dairy'],
      prep_time_mins: 7,
      variants: [
        { name: 'Single', price_delta_paise: 0, is_default: true },
        { name: 'Basket of 3', price_delta_paise: 16500, is_default: false },
      ],
    },
    {
      category: 'breads-rice',
      station: 'grill',
      name: 'Awadhi Subz Dum Biryani',
      description: 'Aged basmati layered with saffron, seasonal vegetables, and mint raita.',
      image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80',
      base_price_paise: 41000,
      is_veg: true,
      spice_level: 'medium',
      allergens: ['Dairy', 'Nuts'],
      prep_time_mins: 18,
      variants: [{ name: 'Handi (Serves 1-2)', price_delta_paise: 0, is_default: true }],
    },
    {
      category: 'craft-drinks',
      station: 'drinks',
      name: 'Kala Khatta Mint Cooler',
      description: 'Tangy jamun reduction muddled with fresh mint, black salt, and sparkling soda.',
      image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80',
      base_price_paise: 16000,
      is_veg: true,
      spice_level: 'none',
      allergens: [],
      prep_time_mins: 5,
      variants: [
        { name: 'Regular (300ml)', price_delta_paise: 0, is_default: true },
        { name: 'Pitcher (1L)', price_delta_paise: 28000, is_default: false },
      ],
    },
    {
      category: 'craft-drinks',
      station: 'drinks',
      name: 'Single-Origin Iced Cold Brew',
      description: '18-hour Chikmagalur cold brew over crystal ice with optional oat milk.',
      image_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=80',
      base_price_paise: 19500,
      is_veg: true,
      spice_level: 'none',
      allergens: [],
      prep_time_mins: 4,
      variants: [
        { name: 'Black', price_delta_paise: 0, is_default: true },
        { name: 'With Oat Milk', price_delta_paise: 4000, is_default: false },
      ],
    },
    {
      category: 'desserts',
      station: 'dessert',
      name: 'Belgian Dark Chocolate Fondant',
      description: 'Warm molten 70% dark chocolate cake served with Madagascar vanilla bean gelato.',
      image_url: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=600&q=80',
      base_price_paise: 28000,
      is_veg: true,
      spice_level: 'none',
      allergens: ['Gluten', 'Dairy', 'Eggs'],
      prep_time_mins: 12,
      variants: [{ name: 'Single Serve', price_delta_paise: 0, is_default: true }],
    },
    {
      category: 'desserts',
      station: 'dessert',
      name: 'Saffron Pistachio Tres Leches',
      description: 'Cardamom-infused milk sponge topped with saffron cream and roasted pistachios.',
      image_url: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&q=80',
      base_price_paise: 26000,
      is_veg: true,
      spice_level: 'none',
      allergens: ['Gluten', 'Dairy', 'Nuts'],
      prep_time_mins: 6,
      variants: [{ name: 'Slice', price_delta_paise: 0, is_default: true }],
    },
  ];

  for (const m of menuDefs) {
    const [item, created] = await models.MenuItem.findOrCreate({
      where: { name: m.name },
      defaults: {
        category_id: categoryMap[m.category].id,
        station_id: stationMap[m.station].id,
        name: m.name,
        description: m.description,
        image_url: m.image_url,
        base_price_paise: m.base_price_paise,
        is_veg: m.is_veg,
        spice_level: m.spice_level,
        allergens: m.allergens,
        is_available: true,
        prep_time_mins: m.prep_time_mins,
      },
    });
    if (created && m.variants?.length) {
      for (const v of m.variants) {
        await models.ItemVariant.create({
          menu_item_id: item.id,
          name: v.name,
          price_delta_paise: v.price_delta_paise,
          is_default: v.is_default,
          is_available: true,
        });
      }
    }
  }

  // 6. Deals
  const dealsDefs = [
    {
      title: '10% Off Orders Above ₹499',
      description: 'Enjoy 10% savings on dine-in orders of ₹499 or more.',
      code: 'WELCOME10',
      discount_type: 'percent',
      discount_value: 10,
      min_order_paise: 49900,
      is_active: true,
    },
    {
      title: 'Flat ₹100 Off Orders Above ₹899',
      description: 'Flat ₹100 instant discount on group orders above ₹899.',
      code: 'FLAT100',
      discount_type: 'flat_paise',
      discount_value: 10000,
      min_order_paise: 89900,
      is_active: true,
    },
  ];
  for (const d of dealsDefs) {
    await models.Deal.findOrCreate({
      where: { code: d.code },
      defaults: d,
    });
  }

  // 7. 10 Tables with unguessable 256-bit QR tokens
  const zones = ['Main Hall', 'Main Hall', 'Main Hall', 'Main Hall', 'Window Side', 'Window Side', 'Patio', 'Patio', 'Lounge', 'Lounge'];
  const capacities = [2, 4, 4, 6, 2, 4, 4, 6, 4, 8];
  const createdTables = [];
  for (let i = 1; i <= 10; i++) {
    const tableNumber = `T${i}`;
    const [tbl, created] = await models.Table.findOrCreate({
      where: { table_number: tableNumber },
      defaults: {
        table_number: tableNumber,
        label: `Table ${i}`,
        capacity: capacities[i - 1],
        zone: zones[i - 1],
        qr_token: generateOpaqueToken(32),
        status: 'free',
        is_active: true,
      },
    });
    if (created) createdTables.push({ table: tableNumber, qrToken: tbl.qr_token });
  }

  return { createdCredentials, createdTables };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('seed.js')) {
  const sequelize = getSequelize();
  seedDatabase(sequelize)
    .then(({ createdCredentials, createdTables }) => {
      console.log('\n=== TableFlow Seed Completed ===');
      if (createdCredentials.length > 0) {
        console.log('\nGenerated Staff Credentials (printed ONCE — save securely):');
        for (const c of createdCredentials) {
          console.log(`  [${c.role.toUpperCase()}] ${c.email}  |  password: ${c.password}`);
        }
      } else {
        console.log('Staff accounts already exist (no passwords overwritten).');
      }
      if (createdTables.length > 0) {
        console.log(`\nCreated ${createdTables.length} tables. Sample QR URL: /t/${createdTables[0].qrToken}`);
      }
      return sequelize.close();
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
