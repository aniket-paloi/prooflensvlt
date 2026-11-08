import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table with Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').default('investigator'),
  createdAt: timestamp('created_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at').defaultNow(),
});

// Vault Folders table
export const vaultFolders = pgTable('vault_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('blue'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Investigation Cases table
export const investigationCases = pgTable('investigation_cases', {
  id: text('id').primaryKey(),
  referenceCode: text('reference_code').notNull(),
  title: text('title').notNull(),
  applicantName: text('applicant_name').notNull(),
  summary: text('summary'),
  scenarioTag: text('scenario_tag'),
  status: text('status').default('under-review'),
  documentCount: integer('document_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Vault Documents table for document management & real-time search
export const vaultDocuments = pgTable('vault_documents', {
  id: text('id').primaryKey(),
  caseId: text('case_id'),
  originalFilename: text('original_filename').notNull(),
  displayName: text('display_name').notNull(),
  contentType: text('content_type').notNull().default('application/pdf'),
  docClass: text('doc_class').notNull(),
  folderId: text('folder_id'),
  fileSize: integer('file_size').default(0),
  sha256: text('sha256').notNull(),
  classificationReason: text('classification_reason'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Cryptographic Audit Events table
export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull(),
  eventType: text('event_type').notNull(),
  actor: text('actor').notNull(),
  prevHash: text('prev_hash'),
  hash: text('hash').notNull(),
  timestamp: text('timestamp').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Google Docs Dossier Export Registry table
export const googleDocsExports = pgTable('google_docs_exports', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull(),
  docId: text('doc_id').notNull(),
  docTitle: text('doc_title').notNull(),
  docUrl: text('doc_url').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Schema Relations
export const usersRelations = relations(users, () => ({}));

export const investigationCasesRelations = relations(
  investigationCases,
  ({ many }) => ({
    documents: many(vaultDocuments),
    auditEvents: many(auditEvents),
    googleDocsExports: many(googleDocsExports),
  })
);

export const vaultDocumentsRelations = relations(vaultDocuments, ({ one }) => ({
  case: one(investigationCases, {
    fields: [vaultDocuments.caseId],
    references: [investigationCases.id],
  }),
  folder: one(vaultFolders, {
    fields: [vaultDocuments.folderId],
    references: [vaultFolders.id],
  }),
}));

export const vaultFoldersRelations = relations(vaultFolders, ({ many }) => ({
  documents: many(vaultDocuments),
}));
