import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}

const connectionString = process.env.DATABASE_URL;


if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

const ADMIN_EMAIL = 'wafflegilang@gmail.com';
const ADMIN_NAME = 'Gimigkk';
const ADMIN_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

async function seed() {
  console.log('🌱 Starting COPM Production Seed...');

  let adminAuthId: string = crypto.randomUUID();

  // If Supabase Service Role Key is available, link or create Supabase Auth user
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuthUser = usersData?.users?.find(
        (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      );

      if (existingAuthUser) {
        adminAuthId = existingAuthUser.id;
        console.log(`✅ Found existing Supabase Auth user for ${ADMIN_EMAIL} (ID: ${adminAuthId})`);
      } else {
        console.log(`ℹ️ Supabase Auth user not found for ${ADMIN_EMAIL}. Creating Auth user...`);
        const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: ADMIN_EMAIL,
          email_confirm: true,
          user_metadata: { full_name: ADMIN_NAME },
        });

        if (createError) {
          console.warn(`⚠️ Could not auto-create auth user: ${createError.message}. Using generated UUID.`);
        } else if (newAuthUser?.user) {
          adminAuthId = newAuthUser.user.id;
          console.log(`✅ Created Supabase Auth user (ID: ${adminAuthId})`);
        }
      }
    } catch (err) {
      console.warn('⚠️ Supabase Admin API skipped:', err);
    }
  }

  // 1. Seed / Upsert Admin Profile
  const existingProfiles = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.email, ADMIN_EMAIL));

  if (existingProfiles.length === 0) {
    await db.insert(schema.profiles).values({
      id: adminAuthId,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
      avatarUrl: ADMIN_AVATAR,
      role: 'admin',
      isApproved: true,
    });
    console.log(`✅ Seeded Superadmin profile: ${ADMIN_NAME} (${ADMIN_EMAIL})`);
  } else {
    adminAuthId = existingProfiles[0].id;
    await db
      .update(schema.profiles)
      .set({
        role: 'admin',
        isApproved: true,
        fullName: ADMIN_NAME,
        updatedAt: new Date(),
      })
      .where(eq(schema.profiles.id, adminAuthId));
    console.log(`✅ Updated existing profile to Superadmin: ${ADMIN_EMAIL}`);
  }

  // 2. Seed 1 Placeholder Division
  const existingDivisions = await db.select().from(schema.divisions);
  let defaultDivisionId: string;

  if (existingDivisions.length === 0) {
    const [insertedDiv] = await db
      .insert(schema.divisions)
      .values({
        name: 'General',
      })
      .returning();
    defaultDivisionId = insertedDiv.id;
    console.log(`✅ Seeded 1 placeholder division: "${insertedDiv.name}"`);
  } else {
    defaultDivisionId = existingDivisions[0].id;
    console.log(`ℹ️ Divisions table already contains ${existingDivisions.length} division(s).`);
  }

  // 3. Seed 1 Default Page
  const existingPages = await db.select().from(schema.pages);
  if (existingPages.length === 0) {
    const [insertedPage] = await db
      .insert(schema.pages)
      .values({
        name: 'Page 1',
        description: 'Primary COPM board for organization requests',
        createdBy: adminAuthId,
      })
      .returning();
    console.log(`✅ Seeded default workspace board: "${insertedPage.name}"`);
  } else {
    console.log(`ℹ️ Pages table already contains ${existingPages.length} page(s).`);
  }

  console.log('\n🎉 Database Seed Complete! Ready for production deployment.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
