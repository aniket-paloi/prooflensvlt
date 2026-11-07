import { eq, desc } from 'drizzle-orm';
import { db } from './index.ts';
import {
  users,
  vaultFolders,
  investigationCases,
  vaultDocuments,
  auditEvents,
  googleDocsExports,
} from './schema.ts';

// User synchronization helper using upsert
export async function getOrCreateSqlUser(params: {
  uid: string;
  email: string;
  displayName?: string;
  role?: string;
}) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: params.email,
        displayName: params.displayName || null,
        role: params.role || 'investigator',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
          displayName: params.displayName || null,
          role: params.role || 'investigator',
          lastLoginAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Cloud SQL getOrCreateSqlUser failed:', error);
    throw new Error('Database user sync failed.', { cause: error });
  }
}

// Record a Google Docs export in Cloud SQL
export async function recordGoogleDocsExport(params: {
  id: string;
  caseId: string;
  docId: string;
  docTitle: string;
  docUrl: string;
  createdBy: string;
}) {
  try {
    const result = await db
      .insert(googleDocsExports)
      .values({
        id: params.id,
        caseId: params.caseId,
        docId: params.docId,
        docTitle: params.docTitle,
        docUrl: params.docUrl,
        createdBy: params.createdBy,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Cloud SQL recordGoogleDocsExport failed:', error);
    throw new Error('Failed to record Google Docs export in database.', {
      cause: error,
    });
  }
}

// Fetch Google Docs exports for a case
export async function getGoogleDocsExportsForCase(caseId: string) {
  try {
    return await db
      .select()
      .from(googleDocsExports)
      .where(eq(googleDocsExports.caseId, caseId))
      .orderBy(desc(googleDocsExports.createdAt));
  } catch (error) {
    console.error('Cloud SQL getGoogleDocsExportsForCase failed:', error);
    throw new Error('Failed to retrieve Google Docs exports.', { cause: error });
  }
}

// Sync documents to Cloud SQL
export async function syncVaultDocumentsToSql(
  docs: Array<{
    id: string;
    caseId: string;
    originalFilename?: string;
    displayName: string;
    contentType?: string;
    docClass: string;
    folderId?: string;
    fileSize?: number;
    sha256: string;
    classificationReason?: string;
  }>
) {
  try {
    for (const d of docs) {
      await db
        .insert(vaultDocuments)
        .values({
          id: d.id,
          caseId: d.caseId,
          originalFilename: d.originalFilename || d.displayName,
          displayName: d.displayName,
          contentType: d.contentType || 'application/pdf',
          docClass: d.docClass,
          folderId: d.folderId || null,
          fileSize: d.fileSize || 0,
          sha256: d.sha256,
          classificationReason: d.classificationReason || null,
        })
        .onConflictDoUpdate({
          target: vaultDocuments.id,
          set: {
            displayName: d.displayName,
            contentType: d.contentType || 'application/pdf',
            docClass: d.docClass,
            folderId: d.folderId || null,
            fileSize: d.fileSize || 0,
          },
        });
    }
  } catch (error) {
    console.error('Cloud SQL syncVaultDocumentsToSql failed:', error);
    // Non-fatal logging to preserve application continuity
  }
}
