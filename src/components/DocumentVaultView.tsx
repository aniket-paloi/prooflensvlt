import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CheckSquare,
  Cpu,
  Database,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  FileWarning,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Play,
  Search,
  Square,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { prooflensApi } from '../api/client';
import {
  listUserGoogleDocs,
  fetchGoogleDocContent,
  type GoogleDriveFile,
} from '../api/googleDocs';
import type {
  BulkProcessingBatchResult,
  CaseRecord,
  DocumentFolder,
  EnrichedVaultDocument,
  FolderColor,
  RunDetailsPayload,
} from '../types/prooflens';

interface DocumentVaultViewProps {
  onOpenDocumentInWorkspace: (
    caseId: string,
    documentId: string,
    tab?: 'overview' | 'documents' | 'visualize'
  ) => void;
  onCaseUploaded: (newCase: CaseRecord, runDetails: RunDetailsPayload) => void;
}

const FOLDER_COLOR_CLASSES: Record<
  FolderColor,
  { badge: string; dot: string }
> = {
  blue: {
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
    dot: 'bg-blue-600',
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-600',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-900 border-amber-200',
    dot: 'bg-amber-600',
  },
  violet: {
    badge: 'bg-purple-50 text-purple-800 border-purple-200',
    dot: 'bg-purple-600',
  },
  rose: {
    badge: 'bg-rose-50 text-rose-800 border-rose-200',
    dot: 'bg-rose-600',
  },
  slate: {
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    dot: 'bg-slate-600',
  },
};

export function DocumentVaultView({
  onOpenDocumentInWorkspace,
  onCaseUploaded,
}: DocumentVaultViewProps) {
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [documents, setDocuments] = useState<EnrichedVaultDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [docClassFilter, setDocClassFilter] = useState<string>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Google Docs state
  const [gdocsModalOpen, setGdocsModalOpen] = useState<boolean>(false);
  const [gdocsList, setGdocsList] = useState<GoogleDriveFile[]>([]);
  const [loadingGdocs, setLoadingGdocs] = useState<boolean>(false);
  const [gdocsError, setGdocsError] = useState<string>('');
  const [importingGdocId, setImportingGdocId] = useState<string | null>(null);

  // Multi-document selection & Bulk Parallel OCR/Analysis state
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<
    'existing-cases-parallel' | 'consolidated-cross-document-case'
  >('existing-cases-parallel');
  const [consolidatedTitle, setConsolidatedTitle] = useState<string>('');
  const [bulkProcessing, setBulkProcessing] = useState<boolean>(false);
  const [bulkMoveTargetFolder, setBulkMoveTargetFolder] = useState<string>('');
  const [bulkMoving, setBulkMoving] = useState<boolean>(false);
  const [latestBatchResult, setLatestBatchResult] =
    useState<BulkProcessingBatchResult | null>(null);

  // Create Folder form state
  const [creatingFolder, setCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [newFolderDesc, setNewFolderDesc] = useState<string>('');
  const [newFolderColor, setNewFolderColor] = useState<FolderColor>('blue');
  const [savingFolder, setSavingFolder] = useState<boolean>(false);

  // Direct PDF Upload state
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadVaultData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [foldersRes, docsRes] = await Promise.all([
        prooflensApi.listFolders(),
        prooflensApi.listVaultDocuments({
          folderId: selectedFolderId,
          docClass: docClassFilter,
        }),
      ]);
      setFolders(foldersRes.folders);
      setDocuments(docsRes.documents);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load document vault and folders.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, docClassFilter]);

  useEffect(() => {
    loadVaultData();
  }, [loadVaultData]);

  // Real-time instantaneous filtering by filename or content type as user types
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // 1. Content Type Filter
      if (contentTypeFilter !== 'all') {
        const ct = (doc.contentType || doc.mimeType || '').toLowerCase();
        if (contentTypeFilter === 'application/pdf' && !ct.includes('pdf')) return false;
        if (
          contentTypeFilter === 'image' &&
          !ct.includes('image') &&
          !ct.includes('png') &&
          !ct.includes('jpeg')
        ) {
          return false;
        }
        if (contentTypeFilter === 'gdoc' && !ct.includes('google-apps.document')) return false;
      }

      // 2. Real-time search matching filename, content-type, or keywords as user types
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const filenameMatch =
          Boolean(doc.displayName && doc.displayName.toLowerCase().includes(q)) ||
          Boolean(doc.originalFilename && doc.originalFilename.toLowerCase().includes(q));
        const contentTypeMatch =
          Boolean(doc.contentType && doc.contentType.toLowerCase().includes(q)) ||
          Boolean(doc.mimeType && doc.mimeType.toLowerCase().includes(q));
        const docClassMatch =
          Boolean(doc.docClass && doc.docClass.toLowerCase().includes(q));
        const keywordsMatch =
          Boolean(doc.keywords && doc.keywords.some((kw) => kw.toLowerCase().includes(q)));
        const applicantMatch =
          Boolean(doc.applicantName && doc.applicantName.toLowerCase().includes(q)) ||
          Boolean(doc.caseTitle && doc.caseTitle.toLowerCase().includes(q));

        if (!filenameMatch && !contentTypeMatch && !docClassMatch && !keywordsMatch && !applicantMatch) {
          return false;
        }
      }

      return true;
    });
  }, [documents, searchQuery, contentTypeFilter]);

  const handleOpenGoogleDocs = async () => {
    setGdocsModalOpen(true);
    setLoadingGdocs(true);
    setGdocsError('');
    try {
      const files = await listUserGoogleDocs();
      setGdocsList(files);
    } catch (err) {
      setGdocsError(
        err instanceof Error
          ? err.message
          : 'Failed to connect to Google Drive and list Google Docs.'
      );
    } finally {
      setLoadingGdocs(false);
    }
  };

  const handleImportGoogleDoc = async (file: GoogleDriveFile) => {
    setImportingGdocId(file.id);
    setGdocsError('');
    try {
      const { title, plainText } = await fetchGoogleDocContent(file.id);
      const virtualFile = new File(
        [new Blob([plainText], { type: 'text/plain' })],
        `${title}.pdf`,
        { type: 'application/vnd.google-apps.document' }
      );
      const res = await prooflensApi.uploadToVault({
        files: [virtualFile],
        title: `Google Doc Review — ${title}`,
        applicantName: 'Google Workspace Subject',
      });
      await loadVaultData();
      onCaseUploaded(res.case, res.runDetails);
      setGdocsModalOpen(false);
    } catch (err) {
      setGdocsError(
        err instanceof Error ? err.message : 'Failed to import Google Doc into Vault.'
      );
    } finally {
      setImportingGdocId(null);
    }
  };

  const toggleSelectDocument = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const visibleDocIds = filteredDocuments.map((d) => d.id);
  const allVisibleSelected =
    visibleDocIds.length > 0 &&
    visibleDocIds.every((id) => selectedDocIds.includes(id));

  const handleToggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedDocIds((prev) =>
        prev.filter((id) => !visibleDocIds.includes(id))
      );
    } else {
      setSelectedDocIds((prev) =>
        Array.from(new Set([...prev, ...visibleDocIds]))
      );
    }
  };

  const handleSelectByClass = (targetClass: string) => {
    const matchingIds = documents
      .filter((d) => d.docClass === targetClass)
      .map((d) => d.id);
    if (matchingIds.length === 0) return;
    setSelectedDocIds((prev) =>
      Array.from(new Set([...prev, ...matchingIds]))
    );
  };

  const handleBulkParallelProcess = async () => {
    if (selectedDocIds.length === 0) return;
    setBulkProcessing(true);
    setError('');
    try {
      const res = await prooflensApi.bulkProcessDocuments({
        documentIds: selectedDocIds,
        mode: bulkMode,
        consolidatedTitle:
          bulkMode === 'consolidated-cross-document-case' &&
          consolidatedTitle.trim()
            ? consolidatedTitle.trim()
            : undefined,
        actor: auth.currentUser?.email || 'reviewer-local',
      });
      setLatestBatchResult(res.batch);
      setFolders(res.folders);
      await loadVaultData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Bulk parallel OCR and forensic analysis failed.'
      );
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkMoveSelected = async (targetFolderId: string) => {
    if (!targetFolderId || selectedDocIds.length === 0) return;
    setBulkMoving(true);
    setError('');
    try {
      await prooflensApi.bulkMoveDocumentsToFolder(
        selectedDocIds,
        targetFolderId
      );
      setBulkMoveTargetFolder('');
      await loadVaultData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to move selected documents to folder.'
      );
    } finally {
      setBulkMoving(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setSavingFolder(true);
    setError('');
    try {
      const { folder } = await prooflensApi.createFolder({
        name: newFolderName.trim(),
        description: newFolderDesc.trim(),
        color: newFolderColor,
      });

      if (auth.currentUser) {
        try {
          await setDoc(doc(db, 'folders', folder.id), {
            id: folder.id,
            name: folder.name,
            description: folder.description,
            color: folder.color,
            ownerUid: auth.currentUser.uid,
            ownerEmail: auth.currentUser.email || '',
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
          });
        } catch (fbErr) {
          handleFirestoreError(
            fbErr,
            OperationType.CREATE,
            `folders/${folder.id}`
          );
        }
      }

      setNewFolderName('');
      setNewFolderDesc('');
      setCreatingFolder(false);
      await loadVaultData();
      setSelectedFolderId(folder.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create folder.');
    } finally {
      setSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    setError('');
    try {
      await prooflensApi.deleteFolder(folderId);
      if (auth.currentUser) {
        try {
          await deleteDoc(doc(db, 'folders', folderId));
        } catch {
          // Non-fatal if folder wasn't created in Firestore by current user
        }
      }
      if (selectedFolderId === folderId) {
        setSelectedFolderId('all');
      }
      await loadVaultData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete folder.');
    }
  };

  const handleMoveDocument = async (
    documentId: string,
    targetFolderId: string
  ) => {
    setError('');
    try {
      await prooflensApi.moveDocumentToFolder(documentId, targetFolderId);
      await loadVaultData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to move document to folder.'
      );
    }
  };

  const handleDirectFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setUploading(true);
    setError('');
    setUploadStatus(
      `Uploading ${files.length} PDF/document(s) and extracting fields, tables, and keywords...`
    );
    try {
      const targetFolder =
        selectedFolderId !== 'all' && selectedFolderId !== 'unfiled'
          ? selectedFolderId
          : folders[0]?.id || undefined;

      const res = await prooflensApi.uploadToVault({
        files,
        folderId: targetFolder,
        title: `Vault Upload — ${files[0].name.replace(/\.[^.]+$/, '')}`,
        applicantName: 'Uploaded Document Subject',
      });

      if (auth.currentUser) {
        for (const docItem of res.documents) {
          try {
            await setDoc(doc(db, 'documents', docItem.id), {
              id: docItem.id,
              caseId: docItem.caseId,
              folderId: docItem.folderId || null,
              displayName: docItem.displayName,
              fileName: docItem.storageKey,
              mimeType: docItem.mimeType,
              sizeBytes: docItem.byteSize,
              sha256: docItem.sha256,
              docClass: docItem.docClass,
              status: docItem.status,
              pageCount: docItem.pageCount,
              keywords: [],
              ownerUid: auth.currentUser.uid,
              uploadedByEmail: auth.currentUser.email || '',
              ingestedAt: docItem.uploadedAt,
            });
          } catch (fbErr) {
            handleFirestoreError(
              fbErr,
              OperationType.CREATE,
              `documents/${docItem.id}`
            );
          }
        }
      }

      await loadVaultData();
      onCaseUploaded(res.case, res.runDetails);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to upload PDF to vault.'
      );
    } finally {
      setUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const totalDocsCount = folders.reduce(
    (acc, f) => acc + (f.documentCount ?? 0),
    0
  );

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Document Vault & Bulk Parallel OCR Pipeline
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Upload PDFs, organize packets into custom folders, select multiple documents to trigger parallel OCR and cross-document forensic reconciliation runs simultaneously, and search across extracted Indian financial keywords.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={handleDirectFileUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-md bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>
              {uploading ? 'Extracting PDF...' : 'Upload PDF to Vault'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleOpenGoogleDocs}
            className="px-3.5 py-2 rounded-md border border-[#4285F4]/30 bg-blue-50/70 hover:bg-blue-100 text-xs font-semibold text-[#1a73e8] inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Browse and import Google Docs from Google Drive"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#1a73e8]" />
            <span>Google Docs &amp; Drive</span>
          </button>

          <button
            type="button"
            onClick={() => setCreatingFolder((v) => !v)}
            className="px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-blue-700" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {uploadStatus && (
        <div className="p-3 rounded border border-blue-200 bg-blue-50 text-xs font-medium text-blue-900">
          {uploadStatus}
        </div>
      )}

      {error && (
        <div className="p-3 rounded border border-red-200 bg-red-50 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* Bulk Parallel OCR & Analysis Command Bar */}
      <section className="bg-slate-900 text-white rounded-md border border-slate-800 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold tracking-tight text-white">
                Bulk Parallel OCR & Forensic Analysis Engine
              </span>
            </div>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700 tabular-nums">
              {selectedDocIds.length} document{selectedDocIds.length === 1 ? '' : 's'} selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleToggleSelectAllVisible}
              disabled={documents.length === 0}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Square className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>
                {allVisibleSelected
                  ? `Deselect Visible (${documents.length})`
                  : `Select All Visible (${documents.length})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectByClass('salary-slip')}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
            >
              + Salary Slips
            </button>
            <button
              type="button"
              onClick={() => handleSelectByClass('bank-statement')}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
            >
              + Bank Statements
            </button>

            {selectedDocIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDocIds([])}
                className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white text-[11px] cursor-pointer"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor="bulk-execution-mode"
              className="text-[11px] font-medium text-slate-300"
            >
              Execution Mode:
            </label>
            <select
              id="bulk-execution-mode"
              value={bulkMode}
              onChange={(e) =>
                setBulkMode(
                  e.target.value as
                    | 'existing-cases-parallel'
                    | 'consolidated-cross-document-case'
                )
              }
              className="px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-white"
            >
              <option value="existing-cases-parallel">
                Parallel OCR & Per-Case Analysis Runs (Concurrent Worker Pool)
              </option>
              <option value="consolidated-cross-document-case">
                Synthesize Unified Cross-Document Case & Reconcile Selected Files Together
              </option>
            </select>

            {bulkMode === 'consolidated-cross-document-case' && (
              <input
                type="text"
                value={consolidatedTitle}
                onChange={(e) => setConsolidatedTitle(e.target.value)}
                placeholder="Optional unified case title (e.g. Multi-Bank & Payroll Audit)..."
                className="px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-white placeholder:text-slate-400 min-w-[250px]"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Bulk move selected documents to folder"
                value={bulkMoveTargetFolder}
                onChange={(e) => {
                  const val = e.target.value;
                  setBulkMoveTargetFolder(val);
                  if (val) {
                    handleBulkMoveSelected(val);
                  }
                }}
                disabled={selectedDocIds.length === 0 || bulkMoving}
                className="px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 disabled:opacity-40"
              >
                <option value="">
                  {bulkMoving ? 'Moving...' : 'Bulk Move Selected to Folder...'}
                </option>
                <option value="unfiled">Unfiled Documents</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={selectedDocIds.length === 0 || bulkProcessing}
              onClick={handleBulkParallelProcess}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {bulkProcessing
                  ? `Running Parallel OCR (${selectedDocIds.length} Workers)...`
                  : `Run Parallel OCR & Analysis (${selectedDocIds.length} Selected)`}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Bulk Parallel OCR & Analysis Execution Telemetry Panel */}
      {latestBatchResult && (
        <section className="bg-white border border-blue-200 rounded-md overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-blue-50/80 border-b border-blue-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Layers className="w-4 h-4 text-blue-700" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Parallel OCR & Analysis Batch Telemetry — {latestBatchResult.batchId}
              </h2>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-semibold tabular-nums">
                {latestBatchResult.parallelWorkersUsed} Parallel Workers ·{' '}
                {latestBatchResult.totalDurationMs} ms Total Wall-Clock
              </span>
            </div>

            <div className="flex items-center gap-2">
              {latestBatchResult.consolidatedCase &&
                latestBatchResult.consolidatedRunDetails && (
                  <button
                    type="button"
                    onClick={() =>
                      onCaseUploaded(
                        latestBatchResult.consolidatedCase!,
                        latestBatchResult.consolidatedRunDetails!
                      )
                    }
                    className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Open Unified Cross-Document Case in Workspace</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              <button
                type="button"
                onClick={() => setLatestBatchResult(null)}
                aria-label="Dismiss batch telemetry"
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Summary Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <div className="text-[11px] text-slate-500 font-medium">
                  Documents Processed in Parallel
                </div>
                <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  {latestBatchResult.selectedDocumentCount} files (
                  {latestBatchResult.documentResults.reduce(
                    (sum, d) => sum + d.pageCount,
                    0
                  )}{' '}
                  pages)
                </div>
              </div>
              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <div className="text-[11px] text-slate-500 font-medium">
                  Extracted Fields & Tables
                </div>
                <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  {latestBatchResult.documentResults.reduce(
                    (sum, d) => sum + d.extractedFieldsCount,
                    0
                  )}{' '}
                  fields ·{' '}
                  {latestBatchResult.documentResults.reduce(
                    (sum, d) => sum + d.extractedTablesCount,
                    0
                  )}{' '}
                  tables
                </div>
              </div>
              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <div className="text-[11px] text-slate-500 font-medium">
                  Ledger Rows & Visual Checks
                </div>
                <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  {latestBatchResult.documentResults.reduce(
                    (sum, d) => sum + d.extractedTransactionsCount,
                    0
                  )}{' '}
                  txns ·{' '}
                  {latestBatchResult.documentResults.reduce(
                    (sum, d) => sum + d.visualObservationsCount,
                    0
                  )}{' '}
                  visual obs
                </div>
              </div>
              <div className="p-3 rounded border border-slate-200 bg-slate-50">
                <div className="text-[11px] text-slate-500 font-medium">
                  Analysis Runs Completed
                </div>
                <div className="text-base font-bold text-blue-800 font-mono tabular-nums mt-0.5">
                  {latestBatchResult.runsTriggered.length} run(s) ·{' '}
                  {latestBatchResult.runsTriggered.reduce(
                    (sum, r) => sum + r.findingsCount,
                    0
                  )}{' '}
                  findings
                </div>
              </div>
            </div>

            {/* Per-Document Parallel Worker Table */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-900">
                Per-Document Parallel OCR & Layout Extraction Telemetry
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 font-semibold">
                      <th className="py-2 px-3">Document</th>
                      <th className="py-2 px-3">Schema Class</th>
                      <th className="py-2 px-3">OCR / Routing Mode</th>
                      <th className="py-2 px-3 text-right">Pages</th>
                      <th className="py-2 px-3 text-right">Fields</th>
                      <th className="py-2 px-3 text-right">Tables</th>
                      <th className="py-2 px-3 text-right">Ledger Txns</th>
                      <th className="py-2 px-3 text-right">Worker Time</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {latestBatchResult.documentResults.map((dr) => (
                      <tr key={dr.documentId} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-medium text-slate-900">
                          <div>{dr.displayName}</div>
                          <div className="text-[11px] text-slate-500 font-normal">
                            {dr.caseTitle}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                          {dr.docClass}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-blue-800">
                          {dr.routingMode}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {dr.pageCount}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {dr.extractedFieldsCount}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {dr.extractedTablesCount}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {dr.extractedTransactionsCount}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-800 font-semibold">
                          {dr.durationMs} ms
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDocumentInWorkspace(
                                dr.caseId,
                                dr.documentId,
                                'overview'
                              )
                            }
                            className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Triggered Case Analysis Runs */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-900">
                Triggered Case Reconciliation & Forensic Runs ({latestBatchResult.runsTriggered.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {latestBatchResult.runsTriggered.map((rt) => {
                  const firstDocForCase = latestBatchResult.documentResults.find(
                    (d) => d.caseId === rt.caseId
                  );
                  return (
                    <div
                      key={rt.runId}
                      className="p-3 rounded border border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {rt.caseTitle} (Run #{rt.runNumber})
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono tabular-nums mt-0.5">
                          {rt.findingsCount} findings ({rt.discrepancyCount}{' '}
                          high/critical) · {rt.durationMs} ms
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              latestBatchResult.consolidatedCase &&
                              latestBatchResult.consolidatedRunDetails &&
                              rt.caseId === latestBatchResult.consolidatedCase.id
                            ) {
                              onCaseUploaded(
                                latestBatchResult.consolidatedCase,
                                latestBatchResult.consolidatedRunDetails
                              );
                            } else {
                              onOpenDocumentInWorkspace(
                                rt.caseId,
                                firstDocForCase?.documentId || '',
                                'overview'
                              );
                            }
                          }}
                          className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-800 cursor-pointer"
                        >
                          Open Run
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenDocumentInWorkspace(
                              rt.caseId,
                              firstDocForCase?.documentId || '',
                              'visualize'
                            )
                          }
                          className="px-2.5 py-1 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[11px] font-medium text-blue-800 cursor-pointer"
                        >
                          Charts
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main 2-Column Layout: Folders Sidebar + Searchable Document List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Folders */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900">
              Folders ({folders.length})
            </span>
            <button
              type="button"
              onClick={() => setCreatingFolder((v) => !v)}
              className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
            >
              {creatingFolder ? 'Close' : '+ Create'}
            </button>
          </div>

          {creatingFolder && (
            <form
              onSubmit={handleCreateFolder}
              className="p-3.5 border-b border-slate-200 bg-slate-50/70 space-y-2.5"
            >
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Q1 GST & Bank Statements"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newFolderDesc}
                  onChange={(e) => setNewFolderDesc(e.target.value)}
                  placeholder="Folder notes or underwriting team..."
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Color Tag
                </label>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      'blue',
                      'emerald',
                      'amber',
                      'violet',
                      'rose',
                      'slate',
                    ] as FolderColor[]
                  ).map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setNewFolderColor(col)}
                      className={`px-2 py-0.5 rounded text-[11px] border capitalize cursor-pointer ${
                        newFolderColor === col
                          ? FOLDER_COLOR_CLASSES[col].badge + ' font-semibold'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCreatingFolder(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFolder || !newFolderName.trim()}
                  className="px-3 py-1 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingFolder ? 'Saving...' : 'Create Folder'}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => setSelectedFolderId('all')}
              className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                selectedFolderId === 'all'
                  ? 'bg-blue-50/70 text-blue-950 font-semibold'
                  : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-700" />
                <span>All Uploaded Documents</span>
              </span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                {Math.max(totalDocsCount, documents.length)}
              </span>
            </button>

            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              const colorStyle =
                FOLDER_COLOR_CLASSES[folder.color] || FOLDER_COLOR_CLASSES.blue;
              return (
                <div
                  key={folder.id}
                  className={`px-4 py-2.5 text-xs flex items-start justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-blue-50/70 text-blue-950 font-semibold'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(folder.id)}
                    className="text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${colorStyle.dot}`}
                      />
                      <span className="truncate">{folder.name}</span>
                    </div>
                    {folder.description && (
                      <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5 pl-4">
                        {folder.description}
                      </p>
                    )}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-[11px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 tabular-nums">
                      {folder.documentCount}
                    </span>
                    {!folder.id.startsWith('folder-') && (
                      <button
                        type="button"
                        onClick={() => handleDeleteFolder(folder.id)}
                        title="Delete custom folder (documents remain safe)"
                        className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setSelectedFolderId('unfiled')}
              className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                selectedFolderId === 'unfiled'
                  ? 'bg-blue-50/70 text-blue-950 font-semibold'
                  : 'hover:bg-slate-50 text-slate-600'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Folder className="w-4 h-4 text-slate-400" />
                <span>Unfiled Documents</span>
              </span>
            </button>
          </div>

          {/* Cloud SQL PostgreSQL Live Indicator Card */}
          <div className="p-3.5 border-t border-slate-200 bg-slate-50/80 space-y-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-700 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  Cloud SQL PostgreSQL
                </div>
                <div className="text-[10px] font-mono text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Instance: ai-studio-9e7b22f0</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 font-mono leading-tight">
              Region: asia-southeast1 · Drizzle ORM
            </div>
          </div>
        </aside>

        {/* Right Area: Search Bar, Schema Filters & Document Cards */}
        <section className="lg:col-span-9 space-y-4">
          {/* Real-Time Search Bar (Filename or Content Type) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[280px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter documents in real-time by filename (e.g. Payslip.pdf) or content type (e.g. application/pdf, image/png)..."
                  aria-label="Filter documents by filename or content type in real-time"
                  className="w-full pl-10 pr-9 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/30 transition-all font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Schema Filter */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="vault-doc-class-filter"
                  className="text-xs text-slate-500 font-medium whitespace-nowrap"
                >
                  Schema:
                </label>
                <select
                  id="vault-doc-class-filter"
                  value={docClassFilter}
                  onChange={(e) => setDocClassFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                >
                  <option value="all">All Document Schemas</option>
                  <option value="application-summary">Application Summary</option>
                  <option value="salary-slip">Salary Slip</option>
                  <option value="bank-statement">Bank Statement</option>
                  <option value="blueprint-spec">Specification PDF</option>
                </select>
              </div>
            </div>

            {/* Content-Type Quick Filter Pills & Real-Time Count */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                  Content Type:
                </span>
                {[
                  { id: 'all', label: `All Types (${documents.length})` },
                  { id: 'application/pdf', label: 'PDFs (application/pdf)' },
                  { id: 'image', label: 'Images (PNG/JPG)' },
                  { id: 'gdoc', label: 'Google Docs' },
                ].map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => setContentTypeFilter(ct.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                      contentTypeFilter === ct.id
                        ? 'bg-black text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>

              {/* Real-time search status indicator */}
              <div className="text-[11px] font-mono text-slate-500">
                {searchQuery.trim() ? (
                  <span className="text-blue-700 font-semibold">
                    Live match: {filteredDocuments.length} of {documents.length}
                  </span>
                ) : (
                  <span>{filteredDocuments.length} documents ready</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Keyword Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-500 font-medium inline-flex items-center gap-1 mr-1">
              <Tag className="w-3 h-3" />
              <span>Quick Keyword Filter:</span>
            </span>
            {[
              'Infosys',
              'SBI',
              '66,300',
              'HDFC',
              'Biocon',
              'Blueprint',
              'Siddharth',
            ].map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() =>
                  setSearchQuery((prev) => (prev === kw ? '' : kw))
                }
                className={`px-2 py-0.5 rounded border text-[11px] font-mono cursor-pointer transition-colors ${
                  searchQuery.toLowerCase() === kw.toLowerCase()
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {kw}
              </button>
            ))}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-2 py-0.5 text-[11px] text-blue-700 hover:underline cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>

          {/* Document List (Filtered in Real-Time) */}
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-md p-8 text-center text-xs text-slate-500">
              Indexing uploaded PDFs, folders, and extracted keyword tokens...
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-10 text-center space-y-2">
              <FileText className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-900">
                No Documents Match &ldquo;{searchQuery}&rdquo;
              </div>
              <p className="text-xs text-slate-500">
                Try clearing the real-time search query, switching content-type pills, or uploading a new file.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocuments.map((docItem) => {
                const isChecked = selectedDocIds.includes(docItem.id);
                return (
                  <div
                    key={docItem.id}
                    className={`bg-white border rounded-md p-4 transition-colors space-y-3 ${
                      isChecked
                        ? 'border-blue-600 ring-1 ring-blue-600/20 bg-blue-50/15'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectDocument(docItem.id)}
                          aria-label={`Select ${docItem.displayName} for bulk parallel OCR and analysis`}
                          className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer shrink-0"
                        />
                        {docItem.status === 'failed' ||
                        docItem.status === 'unsupported' ? (
                          <FileWarning className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
                        ) : (
                          <FileCheck2 className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              onClick={() => toggleSelectDocument(docItem.id)}
                              className="text-sm font-semibold text-slate-900 cursor-pointer hover:text-blue-800"
                            >
                              {docItem.displayName}
                            </h3>
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 tabular-nums">
                              {docItem.docClass} · {docItem.pageCount}p
                            </span>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                              {docItem.contentType || docItem.mimeType || 'application/pdf'}
                            </span>
                            {searchQuery.trim() &&
                              (docItem.displayName?.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                                docItem.originalFilename?.toLowerCase().includes(searchQuery.toLowerCase().trim())) && (
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                                  ✓ Filename match
                                </span>
                              )}
                            {searchQuery.trim() &&
                              (docItem.contentType || docItem.mimeType)?.toLowerCase().includes(searchQuery.toLowerCase().trim()) && (
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                                  ✓ Content-type match
                                </span>
                              )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span>Case: {docItem.caseTitle}</span>
                            <span aria-hidden="true">·</span>
                            <span>Subject: {docItem.applicantName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px]">
                              SHA-256: {docItem.sha256.slice(0, 14)}…
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Folder Assignment & Quick Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          aria-label={`Assign folder for ${docItem.displayName}`}
                          value={docItem.folderId || ''}
                          onChange={(e) =>
                            handleMoveDocument(docItem.id, e.target.value)
                          }
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-slate-50 text-slate-800"
                        >
                          <option value="unfiled">Unfiled</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              📁 {f.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            onOpenDocumentInWorkspace(
                              docItem.caseId,
                              docItem.id,
                              'visualize'
                            )
                          }
                          className="px-2.5 py-1 rounded border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-xs font-medium text-blue-800 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>Visualize Data</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onOpenDocumentInWorkspace(
                              docItem.caseId,
                              docItem.id,
                              'overview'
                            )
                          }
                          className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Inspect PDF</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Extracted Fields Preview & Keywords */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-500">
                          Extracted Sample ({docItem.fieldsCount} fields,{' '}
                          {docItem.tablesCount} tables):
                        </span>
                        {docItem.sampleFields.slice(0, 4).map((sf, i) => (
                          <span
                            key={i}
                            className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-800"
                          >
                            {sf.label}: <strong>{sf.rawValue}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Google Docs & Drive Integration Modal */}
      {gdocsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ExternalLink className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Google Docs &amp; Drive Integration
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Browse Google Docs from your Google Drive and import them into ProofLens
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGdocsModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {gdocsError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-800">
                  {gdocsError}
                </div>
              )}

              {loadingGdocs ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Connecting to Google Drive &amp; fetching Google Docs...</p>
                </div>
              ) : gdocsList.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="font-semibold text-slate-800 text-sm">
                    No Google Docs Found in Drive
                  </div>
                  <p className="text-slate-500 max-w-sm mx-auto">
                    No Google Docs documents were returned. You can create a Google Doc in your Google Drive or export a ProofLens Dossier.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenGoogleDocs}
                    className="px-4 py-2 rounded-full bg-blue-700 hover:bg-blue-800 text-white font-semibold cursor-pointer"
                  >
                    Refresh Google Drive
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="font-semibold text-slate-800 text-xs flex items-center justify-between">
                    <span>Available Google Docs ({gdocsList.length})</span>
                    <button
                      type="button"
                      onClick={handleOpenGoogleDocs}
                      className="text-blue-700 hover:underline cursor-pointer"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {gdocsList.map((file) => (
                      <div
                        key={file.id}
                        className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {file.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              ID: {file.id.slice(0, 16)}… ·{' '}
                              {file.modifiedTime
                                ? file.modifiedTime.slice(0, 10)
                                : 'Google Doc'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={`https://docs.google.com/document/d/${file.id}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>

                          <button
                            type="button"
                            disabled={importingGdocId === file.id}
                            onClick={() => handleImportGoogleDoc(file)}
                            className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {importingGdocId === file.id
                              ? 'Importing...'
                              : 'Import into Vault'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>Google Docs &amp; Drive Workspace API Scopes Authorized</span>
              <button
                type="button"
                onClick={() => setGdocsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
