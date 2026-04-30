import { pgTable, text, boolean, integer, timestamp, date, json, uuid, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core"

export const journalEntryScopeEnum = pgEnum("journal_entry_scope", [
  "CHAPTER",
  "RANGE",
  "WHOLE_BOOK",
])

export const readingStatusEnum = pgEnum("reading_status", [
  "READING",
  "READ",
  "TBR",  // to be read
  "DNF",  // did not finish
])

export const users = pgTable("users", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  image: text(),
  createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
  emailVerified: boolean("email_verified").default(false),
  username: text().unique(),
  bio: text(),
  streakCount: integer("streak_count").default(0),
  longestStreak: integer("longest_streak").default(0),
  lastEntryDate: date("last_entry_date")


});

export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text().unique().notNull(),
  expiresAt: timestamp("expires_at", { precision: 6, withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { precision: 6, withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { precision: 6, withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { precision: 6, withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
});


export const books = pgTable("books", {
  id: uuid("id").primaryKey().defaultRandom(),
  olKey: text("ol_key").unique(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  coverUrl: text("cover_url"),
  description: text("description"),
  edition: text("edition"),
  pageCount: integer("page_count"),
  publishedYear: integer("published_year"),
  toc: json("toc"),
  createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull().defaultNow(),
})

export const readingProgress = pgTable("reading_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: readingStatusEnum("status").notNull().default("TBR"),
  startedAt: timestamp("started_at", { precision: 6, withTimezone: true }),
  finishedAt: timestamp("finished_at", { precision: 6, withTimezone: true }),
  updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
  furthestChapter: integer("furthest_chapter"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),

}, (t) => [uniqueIndex("reading_progress_user_book_idx").on(t.userId, t.bookId)]
);


export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: journalEntryScopeEnum("scope").notNull().default("CHAPTER"),
  createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
  chapterStart: integer("chapter_start").notNull(),
  chapterEnd: integer("chapter_end").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  content: text().notNull(),
  writingPrompt: text("writing_prompt"),
  isPublic: boolean("is_public").default(false)
}, (t) => [index("journal_entries_user_book_idx").on(t.userId, t.bookId)]
);

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Book = typeof books.$inferSelect
export type NewBook = typeof books.$inferInsert
export type ReadingProgress = typeof readingProgress.$inferSelect
export type JournalEntry = typeof journalEntries.$inferSelect
export type NewJournalEntry = typeof journalEntries.$inferInsert
