import {
  boolean,
  float,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  date,
} from "drizzle-orm/mysql-core";

// ─── Reference / Lookup Tables ───────────────────────────────────────────────

export const breeds = mysqlTable("breeds", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  standardWeightKg: float("standard_weight_kg"),
  originCountry: varchar("origin_country", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ageClasses = mysqlTable("age_classes", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 50 }).notNull(),
  minMonths: int("min_months").notNull(),
  maxMonths: int("max_months"), // NULL = no upper limit
});

export const productionClasses = mysqlTable("production_classes", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 100 }).notNull(),
  description: text("description"),
});

// ─── Core User / Farm Tables ──────────────────────────────────────────────────

export const farms = mysqlTable("farms", {
  id: int("id").autoincrement().primaryKey(),
  farmName: varchar("farm_name", { length: 200 }).notNull(),
  ownerName: varchar("owner_name", { length: 200 }),
  location: varchar("location", { length: 300 }),
  contactNumber: varchar("contact_number", { length: 50 }),
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "farmer", "viewer"]).default("farmer").notNull(),
  farmId: int("farm_id"),
  phoneNumber: varchar("phone_number", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Goat Registry ────────────────────────────────────────────────────────────

export const goats = mysqlTable("goats", {
  id: int("id").autoincrement().primaryKey(),
  tagNumber: varchar("tag_number", { length: 100 }).notNull(),
  name: varchar("name", { length: 200 }),
  breedId: int("breed_id"),
  ageClassId: int("age_class_id"),
  productionClassId: int("production_class_id"),
  gender: mysqlEnum("gender", ["Buck", "Doe", "Wether"]).notNull(),
  dateOfBirth: date("date_of_birth"),
  weightKg: float("weight_kg"),
  damId: int("dam_id"),
  sireId: int("sire_id"),
  healthStatus: mysqlEnum("health_status", [
    "Healthy",
    "Sick",
    "Under_Treatment",
    "Quarantine",
    "Deceased",
  ])
    .default("Healthy")
    .notNull(),
  locationCamp: varchar("location_camp", { length: 200 }),
  isRegistered: boolean("is_registered").default(false),
  registrationNumber: varchar("registration_number", { length: 100 }),
  purchasePrice: float("purchase_price"),
  estimatedValue: float("estimated_value"),
  isActive: boolean("is_active").default(true).notNull(),
  farmId: int("farm_id").notNull(),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Goat = typeof goats.$inferSelect;
export type InsertGoat = typeof goats.$inferInsert;

// ─── Goat Photos ──────────────────────────────────────────────────────────────

export const goatPhotos = mysqlTable("goat_photos", {
  id: int("id").autoincrement().primaryKey(),
  goatId: int("goat_id").notNull(),
  imageUrl: text("image_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  label: mysqlEnum("label", [
    "Left_Side",
    "Right_Side",
    "Face",
    "Full_Body",
    "Ear_Tag",
    "General",
  ])
    .default("General")
    .notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  uploadedBy: int("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type GoatPhoto = typeof goatPhotos.$inferSelect;
export type InsertGoatPhoto = typeof goatPhotos.$inferInsert;

// ─── Health Records ───────────────────────────────────────────────────────────

export const healthRecords = mysqlTable("health_records", {
  id: int("id").autoincrement().primaryKey(),
  goatId: int("goat_id").notNull(),
  recordType: mysqlEnum("record_type", [
    "Vaccination",
    "Treatment",
    "Deworming",
    "Checkup",
    "Surgery",
  ]).notNull(),
  productUsed: varchar("product_used", { length: 200 }),
  dosage: varchar("dosage", { length: 200 }),
  vetName: varchar("vet_name", { length: 200 }),
  vetContact: varchar("vet_contact", { length: 100 }),
  date: date("date").notNull(),
  nextDueDate: date("next_due_date"),
  cost: float("cost"),
  notes: text("notes"),
  recordedBy: int("recorded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type HealthRecord = typeof healthRecords.$inferSelect;
export type InsertHealthRecord = typeof healthRecords.$inferInsert;

// ─── Weight Records ───────────────────────────────────────────────────────────

export const weightRecords = mysqlTable("weight_records", {
  id: int("id").autoincrement().primaryKey(),
  goatId: int("goat_id").notNull(),
  weightKg: float("weight_kg").notNull(),
  date: date("date").notNull(),
  method: mysqlEnum("method", ["Scale", "Tape_Measure", "Estimate"]).default("Scale").notNull(),
  recordedBy: int("recorded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WeightRecord = typeof weightRecords.$inferSelect;
export type InsertWeightRecord = typeof weightRecords.$inferInsert;

// ─── Breeding ─────────────────────────────────────────────────────────────────

export const breedingRecords = mysqlTable("breeding_records", {
  id: int("id").autoincrement().primaryKey(),
  doeId: int("doe_id").notNull(),
  sireId: int("sire_id").notNull(),
  matingDate: date("mating_date").notNull(),
  matingMethod: mysqlEnum("mating_method", ["Natural", "AI"]).default("Natural").notNull(),
  expectedKiddingDate: date("expected_kidding_date"),
  actualKiddingDate: date("actual_kidding_date"),
  kidsBorn: int("kids_born"),
  kidsSurvived: int("kids_survived"),
  kiddingEase: mysqlEnum("kidding_ease", ["Easy", "Assisted", "Difficult"]),
  notes: text("notes"),
  farmId: int("farm_id").notNull(),
  recordedBy: int("recorded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BreedingRecord = typeof breedingRecords.$inferSelect;
export type InsertBreedingRecord = typeof breedingRecords.$inferInsert;

export const kids = mysqlTable("kids", {
  id: int("id").autoincrement().primaryKey(),
  breedingRecordId: int("breeding_record_id").notNull(),
  goatId: int("goat_id"),
  birthWeightKg: float("birth_weight_kg"),
  gender: mysqlEnum("gender", ["Buck", "Doe"]).notNull(),
  birthStatus: mysqlEnum("birth_status", ["Live", "Stillborn"]).default("Live").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Kid = typeof kids.$inferSelect;
export type InsertKid = typeof kids.$inferInsert;

// ─── Transactions ─────────────────────────────────────────────────────────────

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  goatId: int("goat_id").notNull(),
  transactionType: mysqlEnum("transaction_type", [
    "Sale",
    "Purchase",
    "Transfer",
    "Death_Loss",
    "Gift",
  ]).notNull(),
  price: float("price"),
  currency: varchar("currency", { length: 10 }).default("USD"),
  counterpartyName: varchar("counterparty_name", { length: 200 }),
  counterpartyContact: varchar("counterparty_contact", { length: 200 }),
  date: date("date").notNull(),
  invoiceReference: varchar("invoice_reference", { length: 100 }),
  notes: text("notes"),
  farmId: int("farm_id").notNull(),
  recordedBy: int("recorded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  type: mysqlEnum("type", [
    "Health_Due",
    "Kidding_Due",
    "Weight_Check",
    "Sale_Follow_Up",
    "System",
  ]).notNull(),
  message: text("message").notNull(),
  relatedGoatId: int("related_goat_id"),
  isRead: boolean("is_read").default(false).notNull(),
  farmId: int("farm_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
