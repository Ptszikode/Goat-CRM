import { and, asc, count, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  ageClasses,
  breedingRecords,
  breeds,
  farms,
  goatPhotos,
  goats,
  healthRecords,
  kids,
  notifications,
  productionClasses,
  transactions,
  users,
  weightRecords,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getFarmUsers(farmId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.farmId, farmId));
}

export async function updateUserRole(userId: number, role: "admin" | "farmer" | "viewer") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function removeUserFromFarm(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
}

// ─── Farm helpers ─────────────────────────────────────────────────────────────

export async function getFarmById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(farms).where(eq(farms.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createFarm(data: { farmName: string; ownerName?: string; location?: string; contactNumber?: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(farms).values(data);
  return result[0];
}

export async function updateFarm(id: number, data: Partial<{ farmName: string; ownerName: string; location: string; contactNumber: string; email: string }>) {
  const db = await getDb();
  if (!db) return;
  await db.update(farms).set(data).where(eq(farms.id, id));
}

// ─── Reference data helpers ───────────────────────────────────────────────────

export async function getBreeds() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(breeds).orderBy(asc(breeds.name));
}

export async function createBreed(data: { name: string; description?: string; standardWeightKg?: number; originCountry?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(breeds).values(data);
  return result[0];
}

export async function getAgeClasses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ageClasses).orderBy(asc(ageClasses.minMonths));
}

export async function getProductionClasses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productionClasses).orderBy(asc(productionClasses.label));
}

// ─── Goat helpers ─────────────────────────────────────────────────────────────

export async function listGoats(farmId: number, filters: {
  breedId?: number; gender?: string; ageClassId?: number; healthStatus?: string;
  camp?: string; search?: string; page?: number; pageSize?: number; isActive?: boolean;
} = {}) {
  const db = await getDb();
  if (!db) return { goats: [], total: 0 };
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 20;
  const conditions = [eq(goats.farmId, farmId)];
  if (filters.isActive !== undefined) conditions.push(eq(goats.isActive, filters.isActive));
  else conditions.push(eq(goats.isActive, true));
  if (filters.breedId) conditions.push(eq(goats.breedId, filters.breedId));
  if (filters.gender) conditions.push(eq(goats.gender, filters.gender as "Buck" | "Doe" | "Wether"));
  if (filters.ageClassId) conditions.push(eq(goats.ageClassId, filters.ageClassId));
  if (filters.healthStatus) conditions.push(eq(goats.healthStatus, filters.healthStatus as "Healthy" | "Sick" | "Under_Treatment" | "Quarantine" | "Deceased"));
  if (filters.camp) conditions.push(eq(goats.locationCamp, filters.camp));
  if (filters.search) conditions.push(or(like(goats.tagNumber, `%${filters.search}%`), like(goats.name, `%${filters.search}%`))!);
  const [rows, totalRows] = await Promise.all([
    db.select().from(goats).where(and(...conditions)).orderBy(desc(goats.createdAt)).limit(pageSize).offset(page * pageSize),
    db.select({ count: count() }).from(goats).where(and(...conditions)),
  ]);
  return { goats: rows, total: totalRows[0]?.count ?? 0 };
}

export async function getGoatById(id: number, farmId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(goats).where(and(eq(goats.id, id), eq(goats.farmId, farmId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createGoat(data: {
  tagNumber: string; name?: string; breedId?: number; ageClassId?: number; productionClassId?: number;
  gender: "Buck" | "Doe" | "Wether"; dateOfBirth?: string; weightKg?: number; damId?: number; sireId?: number;
  healthStatus?: "Healthy" | "Sick" | "Under_Treatment" | "Quarantine" | "Deceased";
  locationCamp?: string; isRegistered?: boolean; registrationNumber?: string;
  purchasePrice?: number; estimatedValue?: number; farmId: number; createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const insertData = { ...data, dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined };
  const result = await db.insert(goats).values(insertData);
  return result[0];
}

export async function updateGoat(id: number, farmId: number, data: Partial<typeof goats.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(goats).set(data).where(and(eq(goats.id, id), eq(goats.farmId, farmId)));
}

export async function getGoatOffspring(goatId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(goats).where(or(eq(goats.damId, goatId), eq(goats.sireId, goatId))!);
}

export async function getPedigree(goatId: number, generations: number = 3): Promise<unknown> {
  const db = await getDb();
  if (!db || generations === 0) return null;
  const result = await db.select().from(goats).where(eq(goats.id, goatId)).limit(1);
  if (!result.length) return null;
  const goat = result[0];
  const [sire, dam] = await Promise.all([
    goat.sireId ? getPedigree(goat.sireId, generations - 1) : null,
    goat.damId ? getPedigree(goat.damId, generations - 1) : null,
  ]);
  return { goat, sire, dam };
}

export async function countGoatsByTag(tagNumber: string, farmId: number, excludeId?: number) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [eq(goats.tagNumber, tagNumber), eq(goats.farmId, farmId)];
  if (excludeId) conditions.push(sql`${goats.id} != ${excludeId}`);
  const result = await db.select({ count: count() }).from(goats).where(and(...conditions));
  return result[0]?.count ?? 0;
}

// ─── Photo helpers ────────────────────────────────────────────────────────────

export async function getGoatPhotos(goatId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(goatPhotos).where(eq(goatPhotos.goatId, goatId)).orderBy(desc(goatPhotos.uploadedAt));
}

export async function createGoatPhoto(data: { goatId: number; imageUrl: string; thumbnailUrl?: string; label?: "Left_Side" | "Right_Side" | "Face" | "Full_Body" | "Ear_Tag" | "General"; isPrimary?: boolean; uploadedBy?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(goatPhotos).values(data);
  return result[0];
}

export async function setPrimaryPhoto(photoId: number, goatId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(goatPhotos).set({ isPrimary: false }).where(eq(goatPhotos.goatId, goatId));
  await db.update(goatPhotos).set({ isPrimary: true }).where(eq(goatPhotos.id, photoId));
}

export async function updatePhotoLabel(photoId: number, label: "Left_Side" | "Right_Side" | "Face" | "Full_Body" | "Ear_Tag" | "General") {
  const db = await getDb();
  if (!db) return;
  await db.update(goatPhotos).set({ label }).where(eq(goatPhotos.id, photoId));
}

export async function deletePhoto(photoId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(goatPhotos).where(eq(goatPhotos.id, photoId));
}

export async function getPhotoById(photoId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(goatPhotos).where(eq(goatPhotos.id, photoId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Health helpers ───────────────────────────────────────────────────────────

export async function createHealthRecord(data: {
  goatId: number; recordType: "Vaccination" | "Treatment" | "Deworming" | "Checkup" | "Surgery";
  productUsed?: string; dosage?: string; vetName?: string; vetContact?: string;
  date: string; nextDueDate?: string; cost?: number; notes?: string; recordedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const insertData = { ...data, date: new Date(data.date), nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : undefined };
  const result = await db.insert(healthRecords).values(insertData);
  return result[0];
}

export async function getHealthHistory(goatId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(healthRecords).where(eq(healthRecords.goatId, goatId)).orderBy(desc(healthRecords.date));
}

export async function getUpcomingHealthDue(farmId: number, daysAhead: number = 30) {
  const db = await getDb();
  if (!db) return [];
  const today = new Date();
  const cutoff = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const todayStr = today.toISOString().split("T")[0];
  const cutoffStr = cutoff.toISOString().split("T")[0];
  return db
    .select({
      id: healthRecords.id,
      goatId: healthRecords.goatId,
      recordType: healthRecords.recordType,
      productUsed: healthRecords.productUsed,
      nextDueDate: healthRecords.nextDueDate,
      tagNumber: goats.tagNumber,
      goatName: goats.name,
    })
    .from(healthRecords)
    .innerJoin(goats, eq(healthRecords.goatId, goats.id))
    .where(
      and(
        eq(goats.farmId, farmId),
        eq(goats.isActive, true),
        gte(healthRecords.nextDueDate, today),
        lte(healthRecords.nextDueDate, cutoff)
      )
    )
    .orderBy(asc(healthRecords.nextDueDate));
}

// ─── Weight helpers ───────────────────────────────────────────────────────────

export async function createWeightRecord(data: { goatId: number; weightKg: number; date: string; method?: "Scale" | "Tape_Measure" | "Estimate"; recordedBy?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(weightRecords).values({ ...data, date: new Date(data.date) });
  return result[0];
}

export async function getWeightHistory(goatId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weightRecords).where(eq(weightRecords.goatId, goatId)).orderBy(asc(weightRecords.date));
}

export async function getLastTwoWeights(goatId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weightRecords).where(eq(weightRecords.goatId, goatId)).orderBy(desc(weightRecords.date)).limit(2);
}

// ─── Breeding helpers ─────────────────────────────────────────────────────────

export async function createBreedingRecord(data: {
  doeId: number; sireId: number; matingDate: string; matingMethod?: "Natural" | "AI";
  expectedKiddingDate?: string; notes?: string; farmId: number; recordedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const insertData = { ...data, matingDate: new Date(data.matingDate), expectedKiddingDate: data.expectedKiddingDate ? new Date(data.expectedKiddingDate) : undefined };
  const result = await db.insert(breedingRecords).values(insertData);
  return result[0];
}

export async function getBreedingRecords(farmId: number, filters: { doeId?: number; sireId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(breedingRecords.farmId, farmId)];
  if (filters.doeId) conditions.push(eq(breedingRecords.doeId, filters.doeId));
  if (filters.sireId) conditions.push(eq(breedingRecords.sireId, filters.sireId));
  return db.select().from(breedingRecords).where(and(...conditions)).orderBy(desc(breedingRecords.matingDate));
}

export async function getBreedingRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(breedingRecords).where(eq(breedingRecords.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateBreedingRecord(id: number, data: Partial<{ doeId: number; sireId: number; matingDate: Date; matingMethod: "Natural" | "AI"; expectedKiddingDate: Date; actualKiddingDate: Date; kidsBorn: number; kidsSurvived: number; kiddingEase: "Easy" | "Assisted" | "Difficult"; notes: string; farmId: number; recordedBy: number }>) {
  const db = await getDb();
  if (!db) return;
  await db.update(breedingRecords).set(data).where(eq(breedingRecords.id, id));
}

export async function createKid(data: { breedingRecordId: number; goatId?: number; birthWeightKg?: number; gender: "Buck" | "Doe"; birthStatus?: "Live" | "Stillborn"; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(kids).values(data);
  return result[0];
}

export async function getKidsByBreedingRecord(breedingRecordId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kids).where(eq(kids.breedingRecordId, breedingRecordId));
}

export async function getBreedingPerformance(farmId: number) {
  const db = await getDb();
  if (!db) return null;
  const records = await db.select().from(breedingRecords).where(and(eq(breedingRecords.farmId, farmId)));
  const completed = records.filter(r => r.actualKiddingDate !== null);
  const totalKidsBorn = completed.reduce((sum, r) => sum + (r.kidsBorn ?? 0), 0);
  const totalKidsSurvived = completed.reduce((sum, r) => sum + (r.kidsSurvived ?? 0), 0);
  const avgKidsPerBirth = completed.length > 0 ? totalKidsBorn / completed.length : 0;
  const survivalRate = totalKidsBorn > 0 ? (totalKidsSurvived / totalKidsBorn) * 100 : 0;
  const easeBreakdown = { Easy: 0, Assisted: 0, Difficult: 0 };
  completed.forEach(r => { if (r.kiddingEase) easeBreakdown[r.kiddingEase]++; });
  return { totalMatings: records.length, completedKiddings: completed.length, avgKidsPerBirth, survivalRate, easeBreakdown };
}

// ─── Transaction helpers ──────────────────────────────────────────────────────

export async function createTransaction(data: {
  goatId: number; transactionType: "Sale" | "Purchase" | "Transfer" | "Death_Loss" | "Gift";
  price?: number; currency?: string; counterpartyName?: string; counterpartyContact?: string;
  date: string; invoiceReference?: string; notes?: string; farmId: number; recordedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(transactions).values({ ...data, date: new Date(data.date) });
  return result[0];
}

export async function getTransactions(farmId: number, filters: { type?: string; goatId?: number; startDate?: string; endDate?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(transactions.farmId, farmId)];
  if (filters.type) conditions.push(eq(transactions.transactionType, filters.type as "Sale" | "Purchase" | "Transfer" | "Death_Loss" | "Gift"));
  if (filters.goatId) conditions.push(eq(transactions.goatId, filters.goatId));
  if (filters.startDate) conditions.push(gte(transactions.date, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(transactions.date, new Date(filters.endDate)));
  return db
    .select({
      id: transactions.id,
      goatId: transactions.goatId,
      transactionType: transactions.transactionType,
      price: transactions.price,
      currency: transactions.currency,
      counterpartyName: transactions.counterpartyName,
      counterpartyContact: transactions.counterpartyContact,
      date: transactions.date,
      invoiceReference: transactions.invoiceReference,
      notes: transactions.notes,
      farmId: transactions.farmId,
      recordedBy: transactions.recordedBy,
      createdAt: transactions.createdAt,
      tagNumber: goats.tagNumber,
      goatName: goats.name,
    })
    .from(transactions)
    .leftJoin(goats, eq(transactions.goatId, goats.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date));
}

export async function getFinancialSummary(farmId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq(transactions.farmId, farmId)];
  if (startDate) conditions.push(gte(transactions.date, new Date(startDate)));
  if (endDate) conditions.push(lte(transactions.date, new Date(endDate)));
  const rows = await db.select().from(transactions).where(and(...conditions));
  const sales = rows.filter(r => r.transactionType === "Sale");
  const purchases = rows.filter(r => r.transactionType === "Purchase");
  const totalRevenue = sales.reduce((s, r) => s + (r.price ?? 0), 0);
  const totalSpend = purchases.reduce((s, r) => s + (r.price ?? 0), 0);
  return { totalSales: sales.length, totalPurchases: purchases.length, totalRevenue, totalSpend, net: totalRevenue - totalSpend };
}

// ─── Notification helpers ─────────────────────────────────────────────────────

export async function createNotification(data: { userId: number; type: "Health_Due" | "Kidding_Due" | "Weight_Check" | "Sale_Follow_Up" | "System"; message: string; relatedGoatId?: number; farmId?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function getUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))).orderBy(desc(notifications.createdAt));
}

export async function getAllNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

// ─── Dashboard / Report helpers ───────────────────────────────────────────────

export async function getHerdSummary(farmId: number) {
  const db = await getDb();
  if (!db) return null;
  const allGoats = await db.select().from(goats).where(and(eq(goats.farmId, farmId), eq(goats.isActive, true)));
  const byGender: Record<string, number> = {};
  const byHealth: Record<string, number> = {};
  const byCamp: Record<string, number> = {};
  const byBreed: Record<number, number> = {};
  const byAgeClass: Record<number, number> = {};
  let totalWeight = 0; let weightCount = 0;
  for (const g of allGoats) {
    byGender[g.gender] = (byGender[g.gender] ?? 0) + 1;
    byHealth[g.healthStatus] = (byHealth[g.healthStatus] ?? 0) + 1;
    if (g.locationCamp) byCamp[g.locationCamp] = (byCamp[g.locationCamp] ?? 0) + 1;
    if (g.breedId) byBreed[g.breedId] = (byBreed[g.breedId] ?? 0) + 1;
    if (g.ageClassId) byAgeClass[g.ageClassId] = (byAgeClass[g.ageClassId] ?? 0) + 1;
    if (g.weightKg) { totalWeight += g.weightKg; weightCount++; }
  }
  return { total: allGoats.length, byGender, byHealth, byCamp, byBreed, byAgeClass, avgWeight: weightCount > 0 ? totalWeight / weightCount : 0 };
}

export async function getMortalityReport(farmId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(goats.farmId, farmId), eq(goats.healthStatus, "Deceased")];
  return db.select().from(goats).where(and(...conditions));
}

export async function getRecentTransactions(farmId: number, limit: number = 5) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: transactions.id,
      transactionType: transactions.transactionType,
      price: transactions.price,
      currency: transactions.currency,
      counterpartyName: transactions.counterpartyName,
      date: transactions.date,
      tagNumber: goats.tagNumber,
      goatName: goats.name,
    })
    .from(transactions)
    .leftJoin(goats, eq(transactions.goatId, goats.id))
    .where(eq(transactions.farmId, farmId))
    .orderBy(desc(transactions.date))
    .limit(limit);
}

export async function generateInvoiceRef(): Promise<string> {
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `${prefix}-${rand}`;
}
