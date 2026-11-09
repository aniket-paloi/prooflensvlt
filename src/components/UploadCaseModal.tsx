import { useRef, useState } from 'react';
import { FileText, FileUp, ShieldAlert, Trash2, X } from 'lucide-react';
import { prooflensApi } from '../api/client';
import type { CaseRecord, RunDetailsPayload } from '../types/prooflens';

interface UploadCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaseProcessed: (newCase: CaseRecord, runDetails: RunDetailsPayload) => void;
}

export function UploadCaseModal({
  isOpen,
  onClose,
  onCaseProcessed,
}: UploadCaseModalProps) {
  const [title, setTitle] = useState<string>('');
  const [applicantName, setApplicantName] = useState<string>('');
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...picked]);
    if (!title && picked[0]) {
      setTitle(`Investigation — ${picked[0].name.replace(/\.[^.]+$/, '')}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Attach at least one PDF, PNG, or JPEG document to analyze.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      setStatusMessage('Creating case and computing SHA-256 byte digests...');
      const { case: created } = await prooflensApi.createCase({
        title: title.trim() || `Uploaded Packet (${files[0].name})`,
        applicantName: applicantName.trim() || 'Uploaded Subject',
        referenceCode: referenceCode.trim() || undefined,
        scenarioTag: 'custom-upload',
      });

      setStatusMessage(
        `Ingesting ${files.length} file(s) and validating content signatures...`
      );
      await prooflensApi.uploadDocuments(created.id, files);

      setStatusMessage(
        'Running PDF.js / raster extraction, Decimal reconciliation & visual baseline...'
      );
      const { runDetails } = await prooflensApi.triggerRun(created.id);
      const { case: refreshedCase } = await prooflensApi.getCase(created.id);

      setFiles([]);
      setTitle('');
      setApplicantName('');
      setReferenceCode('');
      setStatusMessage('');
      onCaseProcessed(refreshedCase, runDetails);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload and analysis failed.');
    } finally {
      setSubmitting(false);
      setStatusMessage('');
    }
  };

  const handleTestCorruptUpload = async () => {
    setSubmitting(true);
    setError('');
    try {
      setStatusMessage('Testing invalid/corrupt PDF signature rejection...');
      const corruptBytes = new TextEncoder().encode(
        'NOT_A_VALID_PDF_STREAM_CORRUPT_HEADER_TEST'
      );
      const badFile = new File([corruptBytes], 'corrupt_bank_statement.pdf', {
        type: 'application/pdf',
      });
      const { case: created } = await prooflensApi.createCase({
        title: 'Failure-Mode Test — Corrupt PDF Header',
        applicantName: 'Test Subject (Invalid File)',
        scenarioTag: 'custom-upload',
        summary:
          'Verifies that malformed/corrupt files produce explicit failed/unsupported states rather than empty successful extractions.',
      });
      await prooflensApi.uploadDocuments(created.id, [badFile]);
      const { runDetails } = await prooflensApi.triggerRun(created.id);
      const { case: refreshedCase } = await prooflensApi.getCase(created.id);
      onCaseProcessed(refreshedCase, runDetails);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failure-mode test error.');
    } finally {
      setSubmitting(false);
      setStatusMessage('');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full overflow-hidden shadow-lg">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2
              id="upload-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              Upload Documents & Run Investigation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Accepts English printed PDFs, PNG, and JPEG files (up to 25 MB each). Original bytes are preserved immutably with SHA-256 digests.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload dialog"
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="case-title-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Case Title
              </label>
              <input
                id="case-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 Home Loan Packet — Ananya Verma"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="applicant-name-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Applicant / Document Subject
              </label>
              <input
                id="applicant-name-input"
                type="text"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                placeholder="e.g. Ananya Verma"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-900"
              />
            </div>
          </div>

          {/* File Picker Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-md p-5 text-center bg-slate-50/60 cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={handleFileChange}
              className="hidden"
            />
            <FileUp className="w-6 h-6 text-blue-700 mx-auto mb-2" />
            <div className="text-xs font-semibold text-slate-900">
              Click to select PDF, PNG, or JPEG files
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Upload application forms, monthly salary slips, bank statements, or specification PDFs
            </div>
          </div>

          {/* Selected Files Queue */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {files.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="px-3 py-1.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-slate-800 truncate">
                    {f.name}{' '}
                    <span className="text-slate-400">
                      ({(f.size / 1024).toFixed(1)} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label={`Remove ${f.name}`}
                    className="text-slate-400 hover:text-red-700 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Quick Live Pipeline Verification Actions */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Or Verify Failure-Mode Handling
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={handleTestCorruptUpload}
                className="px-2.5 py-1.5 rounded border border-amber-200 bg-amber-50/60 hover:bg-amber-100/60 text-xs font-medium text-amber-900 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                <span>Test Corrupt PDF Failure State</span>
              </button>
            </div>
          </div>

          {statusMessage && (
            <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded px-3 py-2 font-medium">
              {statusMessage}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || files.length === 0}
              className="px-4 py-1.5 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Processing Run...' : 'Ingest & Run Investigation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
