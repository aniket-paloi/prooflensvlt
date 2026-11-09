import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { ProofLensStore } from './server/store.ts';
import type { FindingDisposition } from './src/types/prooflens.ts';
import {
  recordGoogleDocsExport,
  getGoogleDocsExportsForCase,
  syncInvestigationCasesToSql,
  syncFoldersToSql,
  syncVaultDocumentsToSql,
} from './src/db/queries.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const store = new ProofLensStore(__dirname);
  const initPromise = store.initialize(__dirname);

  // Sync loaded cases, folders, and vault documents to Cloud SQL asynchronously in background
  initPromise
    .then(async () => {
      try {
        const cases = store.listCases();
        await syncInvestigationCasesToSql(cases);
        const folders = store.listFolders();
        await syncFoldersToSql(folders);
        const allDocs = store.listAllVaultDocuments();
        await syncVaultDocumentsToSql(allDocs);
      } catch (err) {
        console.warn('Initial Cloud SQL sync skipped/logged:', (err as Error).message);
      }
    })
    .catch(() => {});

  // Ensure store initialization has completed before serving API requests
  app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await initPromise;
      next();
    } catch (err) {
      next(err);
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25 MB
      files: 12,
    },
  });

  // Health & Capabilities Contracts
  app.get('/api/health/live', (_req: Request, res: Response) => {
    res.json(store.getHealthLive());
  });

  app.get('/api/health/ready', (_req: Request, res: Response) => {
    res.json(store.getHealthReady());
  });

  app.get('/api/capabilities', (_req: Request, res: Response) => {
    res.json(store.getCapabilities());
  });

  // ============================================================================
  // Authentication & Session Management Endpoints
  // ============================================================================
  app.post('/api/auth/register', (req: Request, res: Response) => {
    try {
      const { email, password, displayName, organization } = req.body || {};
      const session = store.registerUser({
        email: typeof email === 'string' ? email : '',
        password: typeof password === 'string' ? password : '',
        displayName: typeof displayName === 'string' ? displayName : '',
        organization: typeof organization === 'string' ? organization : undefined,
      });
      res.status(201).json({ session });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      const session = store.loginUser({
        email: typeof email === 'string' ? email : '',
        password: typeof password === 'string' ? password : '',
      });
      res.json({ session });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      res.status(401).json({ error: msg });
    }
  });

  app.post('/api/auth/firebase-sync', (req: Request, res: Response) => {
    try {
      const { uid, email, displayName, provider } = req.body || {};
      if (!uid || typeof uid !== 'string') {
        res.status(400).json({ error: 'Firebase UID is required.' });
        return;
      }
      const session = store.syncFirebaseSession({
        uid,
        email: typeof email === 'string' ? email : '',
        displayName: typeof displayName === 'string' ? displayName : undefined,
        provider: provider === 'firebase-email' ? 'firebase-email' : 'firebase-google',
      });
      res.json({ session });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Firebase session sync failed.';
      res.status(400).json({ error: msg });
    }
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = store.getSession(authHeader);
    if (!session) {
      res.status(401).json({ error: 'No active session.' });
      return;
    }
    res.json({ session });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    store.revokeSession(authHeader);
    res.json({ status: 'logged-out' });
  });

  // Session enforcement middleware for original document PDFs, reports, and mutations
  const requireSession = (req: Request, res: Response, next: NextFunction) => {
    const rawToken =
      req.headers.authorization ||
      (typeof req.query.token === 'string' ? req.query.token : undefined);
    const session = store.getSession(rawToken);
    if (!session) {
      res.status(401).json({
        error: 'Authentication required. Please sign in to access this resource.',
      });
      return;
    }
    next();
  };

  // ============================================================================
  // Document Vault, Folders & Keyword Search Endpoints
  // ============================================================================
  app.get('/api/folders', requireSession, (_req: Request, res: Response) => {
    res.json({ folders: store.listFolders() });
  });

  app.post('/api/folders', requireSession, (req: Request, res: Response) => {
    try {
      const { name, description, color, ownerId } = req.body || {};
      const folder = store.createFolder({
        name: typeof name === 'string' ? name : '',
        description: typeof description === 'string' ? description : undefined,
        color,
        ownerId: typeof ownerId === 'string' ? ownerId : undefined,
      });
      res.status(201).json({ folder, folders: store.listFolders() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create folder.';
      res.status(400).json({ error: msg });
    }
  });

  app.delete('/api/folders/:folderId', requireSession, (req: Request, res: Response) => {
    try {
      store.deleteFolder(req.params.folderId);
      res.json({ folders: store.listFolders() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete folder.';
      res.status(400).json({ error: msg });
    }
  });

  app.get('/api/documents', requireSession, (req: Request, res: Response) => {
    const folderId =
      typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const docClass =
      typeof req.query.docClass === 'string' ? req.query.docClass : undefined;
    const documents = store.listAllVaultDocuments({ folderId, search, docClass });
    res.json({ documents, folders: store.listFolders() });
  });

  app.patch('/api/documents/:documentId/folder', requireSession, (req: Request, res: Response) => {
    try {
      const { folderId } = req.body || {};
      if (typeof folderId !== 'string' || !folderId.trim()) {
        res.status(400).json({ error: 'folderId is required.' });
        return;
      }
      const doc = store.moveDocumentToFolder(req.params.documentId, folderId.trim());
      res.json({
        document: doc,
        folders: store.listFolders(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to move document.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/documents/bulk-move', requireSession, (req: Request, res: Response) => {
    try {
      const { documentIds, folderId } = req.body || {};
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        res.status(400).json({ error: 'documentIds array is required.' });
        return;
      }
      if (typeof folderId !== 'string' || !folderId.trim()) {
        res.status(400).json({ error: 'folderId is required.' });
        return;
      }
      const moved = store.bulkMoveDocumentsToFolder(documentIds, folderId.trim());
      res.json({
        movedCount: moved.length,
        documents: moved,
        folders: store.listFolders(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bulk folder move failed.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/documents/bulk-process', requireSession, async (req: Request, res: Response) => {
    try {
      const { documentIds, mode, consolidatedTitle, actor } = req.body || {};
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        res.status(400).json({
          error: 'Select at least one document for bulk parallel OCR and analysis.',
        });
        return;
      }
      const batchResult = await store.executeBulkParallelProcessing({
        documentIds,
        mode:
          mode === 'consolidated-cross-document-case'
            ? 'consolidated-cross-document-case'
            : 'existing-cases-parallel',
        consolidatedTitle:
          typeof consolidatedTitle === 'string' ? consolidatedTitle : undefined,
        actor: typeof actor === 'string' ? actor : 'reviewer-local',
      });
      res.status(201).json({
        batch: batchResult,
        folders: store.listFolders(),
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Bulk parallel OCR and analysis failed.';
      res.status(400).json({ error: msg });
    }
  });

  app.post(
    '/api/documents/upload',
    requireSession,
    upload.array('files', 12),
    async (req: Request, res: Response) => {
      try {
        const files = (req.files as Express.Multer.File[]) || [];
        if (files.length === 0) {
          res.status(400).json({ error: 'Attach at least one PDF, PNG, or JPEG file.' });
          return;
        }
        const folderId =
          typeof req.body?.folderId === 'string' && req.body.folderId.trim()
            ? req.body.folderId.trim()
            : 'unfiled';
        const title =
          typeof req.body?.title === 'string' && req.body.title.trim()
            ? req.body.title.trim()
            : `Document Packet — ${files[0].originalname.replace(/\.[^.]+$/, '')}`;
        const applicantName =
          typeof req.body?.applicantName === 'string' && req.body.applicantName.trim()
            ? req.body.applicantName.trim()
            : 'Uploaded Subject';

        const createdCase = store.createCase({
          title,
          applicantName,
          scenarioTag: 'custom-upload',
          summary: `Uploaded ${files.length} document(s) into folder "${folderId}" and executed full PDF.js extraction.`,
        });

        const uploadedDocs = [];
        for (const f of files) {
          const doc = await store.ingestDocumentBuffer({
            caseId: createdCase.id,
            displayName: f.originalname,
            mimeType: f.mimetype,
            buffer: f.buffer,
            folderId,
          });
          uploadedDocs.push(doc);
        }

        const run = await store.executeProcessingRun(createdCase.id);
        const runDetails = store.getRunDetails(run.id);
        const refreshedCase = store.getCase(createdCase.id);

        res.status(201).json({
          case: refreshedCase,
          documents: uploadedDocs,
          runDetails,
          folders: store.listFolders(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Document upload failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Cases
  app.get('/api/cases', (_req: Request, res: Response) => {
    res.json({ cases: store.listCases() });
  });

  app.post('/api/cases', requireSession, (req: Request, res: Response) => {
    const { title, applicantName, referenceCode, scenarioTag, summary } =
      req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'Case title is required.' });
      return;
    }
    const created = store.createCase({
      title,
      applicantName: typeof applicantName === 'string' ? applicantName : 'Applicant',
      referenceCode: typeof referenceCode === 'string' ? referenceCode : undefined,
      scenarioTag,
      summary: typeof summary === 'string' ? summary : undefined,
    });
    res.status(201).json({ case: created });
  });

  app.get('/api/cases/:caseId', (req: Request, res: Response) => {
    const c = store.getCase(req.params.caseId);
    if (!c) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }
    const documents = store.listCaseDocuments(c.id);
    const runDetails = c.latestRunId ? store.getRunDetails(c.latestRunId) : null;
    res.json({ case: c, documents, runDetails });
  });

  // Documents
  app.get('/api/cases/:caseId/documents', (req: Request, res: Response) => {
    const c = store.getCase(req.params.caseId);
    if (!c) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }
    res.json({ documents: store.listCaseDocuments(c.id) });
  });

  app.post(
    '/api/cases/:caseId/documents',
    requireSession,
    upload.array('files', 12),
    async (req: Request, res: Response) => {
      try {
        const c = store.getCase(req.params.caseId);
        if (!c) {
          res.status(404).json({ error: 'Case not found.' });
          return;
        }
        const files = (req.files as Express.Multer.File[]) || [];
        if (files.length === 0) {
          res.status(400).json({ error: 'No files attached in multipart upload.' });
          return;
        }
        const folderId =
          typeof req.body?.folderId === 'string' && req.body.folderId.trim()
            ? req.body.folderId.trim()
            : undefined;
        const uploadedDocs = [];
        for (const f of files) {
          const doc = await store.ingestDocumentBuffer({
            caseId: c.id,
            displayName: f.originalname,
            mimeType: f.mimetype,
            buffer: f.buffer,
            folderId,
          });
          uploadedDocs.push(doc);
        }
        res.status(201).json({ documents: uploadedDocs });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        res.status(400).json({ error: message });
      }
    }
  );

  // Authorized case-scoped document byte stream for PDF.js & Image viewer (never arbitrary filesystem paths)
  app.get(
    '/api/documents/:documentId/file',
    requireSession,
    (req: Request, res: Response) => {
      const resolved = store.getOriginalFilePath(req.params.documentId);
      if (!resolved) {
        res.status(404).json({ error: 'Document original bytes not found.' });
        return;
      }
      res.setHeader('Content-Type', resolved.doc.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${resolved.doc.displayName.replace(/"/g, '')}"`
      );
      res.sendFile(resolved.path);
    }
  );

  app.get(
    '/api/documents/:documentId/pages/:pageNumber',
    requireSession,
    (req: Request, res: Response) => {
      const pageNumber = Number(req.params.pageNumber);
      if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        res.status(400).json({ error: 'Invalid page number.' });
        return;
      }
      const derivative = store.getPageDerivative(req.params.documentId, pageNumber);
      if (!derivative) {
        res.status(404).json({ error: 'Page derivative not found.' });
        return;
      }
      res.json(derivative);
    }
  );

  // Processing Runs
  app.post(
    '/api/cases/:caseId/runs',
    requireSession,
    async (req: Request, res: Response) => {
      try {
        const run = await store.executeProcessingRun(req.params.caseId);
        const details = store.getRunDetails(run.id);
        res.status(201).json({ run, runDetails: details });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Processing run failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.get('/api/runs/:runId', (req: Request, res: Response) => {
    const details = store.getRunDetails(req.params.runId);
    if (!details) {
      res.status(404).json({ error: 'Run not found.' });
      return;
    }
    res.json(details);
  });

  app.get('/api/runs/:runId/graph', (req: Request, res: Response) => {
    const details = store.getRunDetails(req.params.runId);
    if (!details) {
      res.status(404).json({ error: 'Run not found.' });
      return;
    }
    res.json({ graph: details.graph, provenance: details.provenance });
  });

  app.get('/api/runs/:runId/coverage', (req: Request, res: Response) => {
    const details = store.getRunDetails(req.params.runId);
    if (!details) {
      res.status(404).json({ error: 'Run not found.' });
      return;
    }
    res.json({
      checks: details.checks,
      pages: details.pages,
      documents: details.documents,
    });
  });

  // Field Corrections & Dependency Propagation
  app.post(
    '/api/fields/:fieldId/revisions',
    requireSession,
    (req: Request, res: Response) => {
      try {
        const { expectedRevision, newValue, actor, reason } = req.body || {};
        if (typeof expectedRevision !== 'number') {
          res.status(400).json({ error: 'Numeric expectedRevision is required.' });
          return;
        }
        if (typeof newValue !== 'string' || !newValue.trim()) {
          res.status(400).json({ error: 'Non-empty newValue is required.' });
          return;
        }
        if (typeof reason !== 'string' || !reason.trim()) {
          res.status(400).json({ error: 'Reviewer reason is required.' });
          return;
        }
        const updatedRun = store.correctFieldWithPropagation({
          fieldId: req.params.fieldId,
          expectedRevision,
          newValue,
          actor:
            typeof actor === 'string' && actor.trim() ? actor : 'reviewer-local',
          reason,
        });
        res.json({ runDetails: updatedRun });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Revision update failed.';
        const status = msg.includes('conflict') ? 409 : 400;
        res.status(status).json({ error: msg });
      }
    }
  );

  // Finding Dispositions
  app.post(
    '/api/findings/:findingId/reviews',
    requireSession,
    (req: Request, res: Response) => {
      try {
        const { disposition, actor, reason } = req.body || {};
        const validDispositions: FindingDisposition[] = [
          'open',
          'observation-confirmed',
          'further-verification-needed',
          'false-alert',
          'resolved',
        ];
        if (!validDispositions.includes(disposition)) {
          res.status(400).json({ error: 'Invalid finding disposition.' });
          return;
        }
        if (typeof reason !== 'string' || !reason.trim()) {
          res.status(400).json({ error: 'Disposition reason is required.' });
          return;
        }
        const updated = store.reviewFindingDisposition({
          findingId: req.params.findingId,
          disposition,
          actor:
            typeof actor === 'string' && actor.trim() ? actor : 'reviewer-local',
          reason,
        });
        res.json({ finding: updated });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Review update failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Bounded 7-Tool Investigation Agent + Gemini 3.8 Flash Synthesis
  app.post(
    '/api/findings/:findingId/investigate',
    requireSession,
    async (req: Request, res: Response) => {
      try {
        const actor =
          typeof req.body?.actor === 'string' ? req.body.actor : 'reviewer-local';
        const state = await store.investigateFinding(req.params.findingId, actor);
        res.json({ investigation: state });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Bounded investigation failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Evidence-Grounded Case Q&A (Gemini 3.8 Flash + Prompt-Injection Guard)
  app.post(
    '/api/runs/:runId/questions',
    requireSession,
    async (req: Request, res: Response) => {
      try {
        const question =
          typeof req.body?.question === 'string' ? req.body.question : '';
        const response = await store.askRunQuestion(req.params.runId, question);
        res.json(response);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Question failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Forensic Capability Probe (MobileNetV3 Crop Classifier, Pixel ELA Heatmap, Indian KYC/IFSC Verifier, Signature/Indic OCR)
  app.get('/api/runs/:runId/forensic-probe', (req: Request, res: Response) => {
    try {
      const runId =
        req.params.runId === 'latest' ? undefined : req.params.runId;
      const probe = store.getForensicCapabilityProbe(runId);
      res.json({ probe });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Forensic capability probe failed.';
      res.status(400).json({ error: msg });
    }
  });

  // AI Executive Case Analysis (Gemini 3.8 Flash)
  app.post(
    '/api/runs/:runId/ai-analyze',
    requireSession,
    async (req: Request, res: Response) => {
      try {
        const analysis = await store.generateAIExecutiveAnalysis(
          req.params.runId
        );
        res.json({ analysis });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'AI executive analysis failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Frozen Dossier Snapshots
  app.post(
    '/api/runs/:runId/reports',
    requireSession,
    (req: Request, res: Response) => {
      try {
        const actor =
          typeof req.body?.actor === 'string' ? req.body.actor : 'reviewer-local';
        const report = store.generateReport(req.params.runId, actor);
        res.status(201).json({ report });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Report generation failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.get(
    '/api/reports/:reportId',
    requireSession,
    (req: Request, res: Response) => {
      const report = store.getReport(req.params.reportId);
      if (!report) {
        res.status(404).json({ error: 'Report artifact not found.' });
        return;
      }
      res.json({ report });
    }
  );

  app.post(
    '/api/runs/:runId/dossier-export',
    requireSession,
    (req: Request, res: Response) => {
      try {
        const {
          reportId,
          validatedOnly,
          includeFullAuditChain,
          includeFieldRevisionHistory,
          actor,
        } = req.body || {};
        const exported = store.exportCaseDossierBundle({
          runId: req.params.runId,
          reportId: typeof reportId === 'string' ? reportId : undefined,
          validatedOnly: Boolean(validatedOnly),
          includeFullAuditChain: includeFullAuditChain !== false,
          includeFieldRevisionHistory: includeFieldRevisionHistory !== false,
          actor: typeof actor === 'string' ? actor : 'reviewer-local',
        });
        res.json(exported);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Dossier export failed.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // Google Docs Exports & Cloud SQL Registry
  app.get('/api/cases/:caseId/google-docs-exports', requireSession, async (req: Request, res: Response) => {
    try {
      const exportsList = await getGoogleDocsExportsForCase(req.params.caseId);
      res.json({ exports: exportsList });
    } catch (err) {
      console.error('Error fetching Google Docs exports from Cloud SQL:', err);
      res.json({ exports: [] });
    }
  });

  app.post('/api/cases/:caseId/google-docs-exports', requireSession, async (req: Request, res: Response) => {
    try {
      const { docId, docTitle, docUrl, createdBy } = req.body || {};
      if (!docId || !docUrl) {
        res.status(400).json({ error: 'docId and docUrl are required.' });
        return;
      }
      const record = await recordGoogleDocsExport({
        id: `gdoc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        caseId: req.params.caseId,
        docId: String(docId),
        docTitle: String(docTitle || 'ProofLens Dossier'),
        docUrl: String(docUrl),
        createdBy: String(createdBy || 'reviewer'),
      });
      res.json({ export: record });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to record Google Docs export in Cloud SQL.';
      res.status(500).json({ error: msg });
    }
  });

  // Integrity Timeline & Retained Checkpoint
  app.get('/api/cases/:caseId/audit', (req: Request, res: Response) => {
    const c = store.getCase(req.params.caseId);
    if (!c) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }
    res.json(store.getCaseAudit(c.id));
  });

  app.post(
    '/api/cases/:caseId/audit/checkpoint',
    requireSession,
    (req: Request, res: Response) => {
      const c = store.getCase(req.params.caseId);
      if (!c) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }
      const actor =
        typeof req.body?.actor === 'string' ? req.body.actor : 'reviewer-local';
      res.json(store.saveRetainedCheckpoint(c.id, actor));
    }
  );

  app.post(
    '/api/cases/:caseId/audit/simulate-tamper',
    requireSession,
    (req: Request, res: Response) => {
      const c = store.getCase(req.params.caseId);
      if (!c) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }
      res.json(store.simulateTamperCheck(c.id));
    }
  );

  // Error middleware for Multer & API
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(400).json({ error: msg });
  });

  // Mount Vite middleware in dev or serve built dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ProofLens server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ProofLens server:', err);
  process.exit(1);
});
