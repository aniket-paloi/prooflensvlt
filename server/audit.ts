import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AuditEvent,
  CaseRecord,
  CheckExecution,
  DocumentRecord,
  DossierExportBundle,
  DossierValidatedFindingItem,
  FieldRecord,
  FieldRevision,
  FindingRecord,
  IntegrityVerificationResult,
  InvestigationState,
  PageRecord,
  ProcessingRun,
  ProvenanceAssertion,
  ReportArtifact,
  RetainedCheckpoint,
  ReviewAction,
  VisualObservation,
} from '../src/types/prooflens.ts';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

export function computeEventHash(params: {
  sequence: number;
  eventType: AuditEvent['eventType'];
  actor: string;
  createdAt: string;
  prevHash: string;
  payloadCanonicalJson: string;
}): string {
  const envelope = `${params.sequence}|${params.eventType}|${params.actor}|${params.createdAt}|${params.prevHash}|${params.payloadCanonicalJson}`;
  return crypto.createHash('sha256').update(envelope, 'utf8').digest('hex');
}

export function createAuditEvent(params: {
  caseId: string;
  existingEvents: AuditEvent[];
  eventType: AuditEvent['eventType'];
  actor: string;
  runId?: string;
  payload: Record<string, unknown>;
}): AuditEvent {
  const sequence = params.existingEvents.length + 1;
  const prevHash =
    params.existingEvents.length > 0
      ? params.existingEvents[params.existingEvents.length - 1].eventHash
      : '0'.repeat(64);
  const createdAt = new Date().toISOString();
  const payloadCanonicalJson = canonicalJson(params.payload);
  const eventHash = computeEventHash({
    sequence,
    eventType: params.eventType,
    actor: params.actor,
    createdAt,
    prevHash,
    payloadCanonicalJson,
  });

  return {
    id: `aud-${params.caseId}-seq${sequence}`,
    caseId: params.caseId,
    sequence,
    eventType: params.eventType,
    actor: params.actor,
    runId: params.runId,
    payloadCanonicalJson,
    prevHash,
    eventHash,
    createdAt,
  };
}

export function verifyCaseIntegrity(params: {
  caseId: string;
  events: AuditEvent[];
  checkpoint: RetainedCheckpoint | null;
  documents: DocumentRecord[];
  originalsDir: string;
}): IntegrityVerificationResult {
  const discrepancies: string[] = [];
  const sorted = [...params.events].sort((a, b) => a.sequence - b.sequence);

  let expectedPrev = '0'.repeat(64);
  let chainBroken = false;

  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    if (ev.sequence !== i + 1) {
      chainBroken = true;
      discrepancies.push(
        `Sequence discontinuity at index ${i}: expected sequence ${i + 1}, found ${ev.sequence}.`
      );
    }
    if (ev.prevHash !== expectedPrev) {
      chainBroken = true;
      discrepancies.push(
        `Previous-hash link mismatch at sequence ${ev.sequence}: expected ${expectedPrev.slice(
          0,
          12
        )}..., got ${ev.prevHash.slice(0, 12)}...`
      );
    }
    const recomputed = computeEventHash({
      sequence: ev.sequence,
      eventType: ev.eventType,
      actor: ev.actor,
      createdAt: ev.createdAt,
      prevHash: ev.prevHash,
      payloadCanonicalJson: ev.payloadCanonicalJson,
    });
    if (recomputed !== ev.eventHash) {
      chainBroken = true;
      discrepancies.push(
        `Content hash mismatch at sequence ${ev.sequence} (${ev.eventType}): stored ${ev.eventHash.slice(
          0,
          12
        )}... != recomputed ${recomputed.slice(0, 12)}...`
      );
    }
    expectedPrev = ev.eventHash;
  }

  // Verify original file bytes on disk against recorded SHA-256
  const fileIntegrityChecks: IntegrityVerificationResult['fileIntegrityChecks'] = [];
  let fileMismatch = false;

  for (const doc of params.documents) {
    const fullPath = path.join(params.originalsDir, doc.storageKey);
    let actualSha256 = 'MISSING_FILE_ON_DISK';
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      actualSha256 = crypto.createHash('sha256').update(buf).digest('hex');
    }
    const matches = actualSha256 === doc.sha256;
    if (!matches) {
      fileMismatch = true;
      discrepancies.push(
        `Original file byte mismatch for ${doc.displayName}: expected ${doc.sha256.slice(
          0,
          12
        )}..., actual ${actualSha256.slice(0, 12)}...`
      );
    }
    fileIntegrityChecks.push({
      documentId: doc.id,
      displayName: doc.displayName,
      expectedSha256: doc.sha256,
      actualSha256,
      matches,
    });
  }

  const latestSequence = sorted.length > 0 ? sorted[sorted.length - 1].sequence : 0;
  const latestHeadHash =
    sorted.length > 0 ? sorted[sorted.length - 1].eventHash : '0'.repeat(64);

  let checkpointMismatch = false;
  if (params.checkpoint) {
    if (latestSequence < params.checkpoint.lastSequence) {
      checkpointMismatch = true;
      discrepancies.push(
        `Audit log truncation detected: log ends at sequence ${latestSequence}, but separately retained checkpoint requires sequence >= ${params.checkpoint.lastSequence}.`
      );
    } else if (params.checkpoint.lastSequence > 0) {
      const anchoredEvent = sorted.find(
        (e) => e.sequence === params.checkpoint!.lastSequence
      );
      if (!anchoredEvent || anchoredEvent.eventHash !== params.checkpoint.headHash) {
        checkpointMismatch = true;
        discrepancies.push(
          `Retained checkpoint mismatch at sequence ${params.checkpoint.lastSequence}: checkpoint head ${params.checkpoint.headHash.slice(
            0,
            12
          )}... != chain hash ${anchoredEvent?.eventHash.slice(0, 12) || 'MISSING'}...`
        );
      }
    }
  }

  let status: IntegrityVerificationResult['status'] = 'verified-against-checkpoint';
  if (chainBroken) {
    status = 'tamper-detected-chain-mismatch';
  } else if (fileMismatch) {
    status = 'tamper-detected-file-hash-mismatch';
  } else if (checkpointMismatch) {
    status = 'tamper-detected-checkpoint-mismatch';
  } else if (!params.checkpoint) {
    status = 'unanchored-no-checkpoint';
  }

  return {
    caseId: params.caseId,
    status,
    checkedEventsCount: sorted.length,
    latestSequence,
    latestHeadHash,
    checkpoint: params.checkpoint,
    fileIntegrityChecks,
    discrepancies,
    cannotEstablishNote:
      'Threat-model boundary: Hash-linked audit events and SHA-256 digests verify post-ingestion consistency against a separately retained checkpoint. They do not establish pre-upload authenticity, trusted third-party timestamps, or legal admissibility; a privileged actor controlling both the mutable database and the local checkpoint store could rebuild a local chain.',
    verifiedAt: new Date().toISOString(),
  };
}

export function runIsolatedTamperSimulation(params: {
  caseId: string;
  events: AuditEvent[];
  checkpoint: RetainedCheckpoint | null;
  documents: DocumentRecord[];
  originalsDir: string;
}): {
  simulatedMutation: string;
  verificationResult: IntegrityVerificationResult;
} {
  // Deep copy events in memory so the real database is NEVER mutated
  const copiedEvents: AuditEvent[] = JSON.parse(JSON.stringify(params.events));
  if (copiedEvents.length === 0) {
    return {
      simulatedMutation: 'No events to mutate.',
      verificationResult: verifyCaseIntegrity(params),
    };
  }
  const targetIdx = Math.min(1, copiedEvents.length - 1);
  copiedEvents[targetIdx].payloadCanonicalJson = canonicalJson({
    tampered_simulation: true,
    original_seq: copiedEvents[targetIdx].sequence,
  });

  const result = verifyCaseIntegrity({
    caseId: params.caseId,
    events: copiedEvents,
    checkpoint: params.checkpoint,
    documents: params.documents,
    originalsDir: params.originalsDir,
  });

  return {
    simulatedMutation: `In-memory copy test: mutated payloadCanonicalJson on sequence #${copiedEvents[targetIdx].sequence} without updating descendant hashes (real case database untouched).`,
    verificationResult: result,
  };
}

export function generateFrozenDossierArtifact(params: {
  caseId: string;
  caseTitle: string;
  applicantName: string;
  run: ProcessingRun;
  revisionFingerprint: string;
  documents: DocumentRecord[];
  pages: PageRecord[];
  fields: FieldRecord[];
  fieldRevisions: FieldRevision[];
  checks: CheckExecution[];
  findings: FindingRecord[];
  visualObservations: VisualObservation[];
  provenance: ProvenanceAssertion[];
  investigations: InvestigationState[];
  reviewActions: ReviewAction[];
  generatedBy: string;
}): ReportArtifact {
  const docMap = new Map(params.documents.map((d) => [d.id, d]));

  const uninspectedRegions: string[] = [];
  for (const p of params.pages.slice(0, 12)) {
    const doc = docMap.get(p.documentId);
    for (const u of p.uninspectedRegions) {
      uninspectedRegions.push(
        `${doc?.displayName || p.documentId} p.${p.pageNumber} [${u.bbox.x.toFixed(
          2
        )}, ${u.bbox.y.toFixed(2)}, ${u.bbox.w.toFixed(2)}, ${u.bbox.h.toFixed(
          2
        )}]: ${u.reason}`
      );
    }
  }

  const calculations: string[] = [];
  const alternatives: string[] = [];
  const scopedNegativeEvidence: string[] = [];

  for (const chk of params.checks) {
    for (const step of chk.calculationSteps) {
      calculations.push(`[${chk.checkId} · ${chk.result}] ${step}`);
    }
    if (chk.scopedSearch) {
      scopedNegativeEvidence.push(
        `${chk.scopedSearch.statementText} (Scope: ${chk.scopedSearch.submittedDocuments.join(
          ', '
        )}; Window: ${chk.scopedSearch.dateWindow}; Limitations: ${
          chk.scopedSearch.coverageLimitations
        })`
      );
    }
  }

  for (const fnd of params.findings) {
    for (const alt of fnd.alternativeExplanations) {
      alternatives.push(
        `[${fnd.id}] ${alt.title} (${alt.status}): ${alt.rationale} — Uncertainty: ${alt.remainingUncertainty}`
      );
    }
  }

  const sections: ReportArtifact['sections'] = {
    documentOverview: {
      summary: `Case "${params.caseTitle}" (${params.applicantName}) — Frozen snapshot for Run #${params.run.runNumber} (${params.run.id}), revision fingerprint ${params.revisionFingerprint}. Contains ${params.documents.length} submitted document(s) across ${params.pages.length} page(s).`,
      documents: params.documents.map((d) => ({
        displayName: d.displayName,
        docClass: d.docClass,
        sha256: d.sha256,
        pageCount: d.pageCount,
        routing:
          params.pages.find((p) => p.documentId === d.id)?.routingMode || d.status,
      })),
    },
    extractedInformation: {
      summary: `Extracted ${params.fields.length} source-linked field(s) with ${params.fieldRevisions.length} total revision record(s). Original extracted values are preserved alongside reviewer corrections.`,
      fields: params.fields.slice(0, 40).map((f) => ({
        label: f.label,
        rawValue: f.rawValue,
        normalizedValue: f.normalizedValue,
        basis: f.salaryBasis || 'n/a',
        unit: f.unit || 'n/a',
        period: f.period || 'n/a',
        sourceRef: `${docMap.get(f.documentId)?.displayName || f.documentId} p.${
          f.pageNumber
        } rev.${f.currentRevisionNumber}`,
        revision: f.currentRevisionNumber,
      })),
    },
    contextualAnalysis: {
      summary: `Executed ${params.checks.length} deterministic check(s) using exact base-10 Decimal arithmetic and typed claim alignment (applicant, basis, period, currency, unit).`,
      calculations,
      alternatives:
        alternatives.length > 0
          ? alternatives
          : ['No alternative discrepancy hypotheses required for this snapshot.'],
      scopedNegativeEvidence:
        scopedNegativeEvidence.length > 0
          ? scopedNegativeEvidence
          : ['No incomplete-window negative searches recorded in this run.'],
    },
    visualForensicFindings: {
      summary: `Recorded ${params.visualObservations.length} visual/text-layer observation(s). Note: Trained MobileNetV3 region classifier is not attached in this runtime; findings reflect deterministic native PDF property checks and raster signal baselines.`,
      observations: params.visualObservations.map((o) => ({
        method: `${o.methodName} (${o.methodVersion})`,
        property: o.measuredProperty,
        measured: o.measuredValue,
        sourceRef: `${docMap.get(o.documentId)?.displayName || o.documentId} p.${
          o.pageNumber
        } [${o.sourceBbox.x.toFixed(2)}, ${o.sourceBbox.y.toFixed(2)}]`,
        strength: o.signalStrength,
        limits: o.limitations,
      })),
    },
    evidenceTraceability: {
      summary: `Traceability index linking ${params.provenance.length} provenance assertion(s), ${params.investigations.length} bounded agent trace(s), and ${params.reviewActions.length} reviewer action(s).`,
      provenance: params.provenance.map(
        (p) =>
          `${p.sourceALabel} <-> ${p.sourceBLabel}: ${p.independenceStatus} — ${p.statedBasis}`
      ),
      agentTraces:
        params.investigations.length > 0
          ? params.investigations.map(
              (inv) =>
                `[${inv.findingId}] ${inv.stepsUsed}/${inv.maxSteps} steps (${inv.llmMode}): ${inv.stopReason}`
            )
          : ['No bounded agent follow-up runs executed on this snapshot yet.'],
      reviewerDispositions:
        params.reviewActions.length > 0
          ? params.reviewActions.map(
              (ra) =>
                `${ra.createdAt} · ${ra.actor} (${ra.actionType} on ${ra.targetId}): ${ra.previousState} -> ${ra.newState} | Reason: ${ra.reason}`
            )
          : ['No manual reviewer dispositions or corrections recorded yet.'],
    },
    investigationSummary: {
      summary: `Summary of ${params.findings.length} finding(s): ${
        params.findings.filter((f) => f.outcome === 'discrepancy').length
      } discrepancy, ${
        params.findings.filter((f) => f.outcome === 'possible-explanation').length
      } possible-explanation, ${
        params.findings.filter((f) => f.outcome === 'insufficient-evidence').length
      } insufficient-evidence, ${
        params.findings.filter((f) => f.outcome === 'consistent-within-check').length
      } consistent-within-check.`,
      coverageSummary: params.checks
        .map((c) => `${c.checkId}: ${c.applicability}/${c.lifecycle} -> ${c.result}`)
        .join(' | '),
      uninspectedRegions:
        uninspectedRegions.length > 0
          ? uninspectedRegions
          : ['All primary text regions inspected; margin footers excluded.'],
      limitations: [
        'ProofLens is an evidence-driven investigation workspace; it does not certify document authenticity, establish legal fraud, or contact external issuers.',
        'SHA-256 digests validate post-ingestion byte integrity only.',
        'A green completed check indicates consistency within its stated parameters and submitted pages, never blanket authenticity.',
      ],
    },
  };

  const generatedAt = new Date().toISOString();
  const reportHash = crypto
    .createHash('sha256')
    .update(
      canonicalJson({
        caseId: params.caseId,
        runId: params.run.id,
        revisionFingerprint: params.revisionFingerprint,
        sections,
      })
    )
    .digest('hex');

  return {
    id: `rep-${params.run.id}-${Date.now().toString(36)}`,
    caseId: params.caseId,
    runId: params.run.id,
    revisionFingerprint: params.revisionFingerprint,
    status: 'active',
    reportHash,
    generatedAt,
    generatedBy: params.generatedBy,
    sections,
  };
}

export function buildDossierExportBundle(params: {
  caseRecord: CaseRecord;
  run: ProcessingRun;
  reportSnapshot: ReportArtifact;
  documents: DocumentRecord[];
  findings: FindingRecord[];
  auditEvents: AuditEvent[];
  verification: IntegrityVerificationResult;
  reviewActions: ReviewAction[];
  fieldRevisions: FieldRevision[];
  validatedOnly?: boolean;
  includeFullAuditChain?: boolean;
  includeFieldRevisionHistory?: boolean;
  exportedBy?: string;
}): DossierExportBundle {
  const docMap = new Map(params.documents.map((d) => [d.id, d]));
  const validatedOnly = Boolean(params.validatedOnly);
  const includeFullAuditChain = params.includeFullAuditChain !== false;
  const includeFieldRevisionHistory =
    params.includeFieldRevisionHistory !== false;

  const mapFindingItem = (f: FindingRecord): DossierValidatedFindingItem => {
    const isReviewerValidated = f.disposition !== 'open';
    const isSystemConsistent = f.outcome === 'consistent-within-check';
    const validationState: DossierValidatedFindingItem['validationState'] =
      isReviewerValidated
        ? 'reviewer-validated'
        : isSystemConsistent
        ? 'system-consistent'
        : 'open-unreviewed';

    const evidenceRefs: DossierValidatedFindingItem['evidenceRefs'] = [
      {
        documentId: f.primaryDocumentId,
        documentName:
          docMap.get(f.primaryDocumentId)?.displayName || f.primaryDocumentId,
        pageNumber: f.primaryPageNumber,
        label: 'Primary Source Region',
        bbox: f.primaryBbox,
      },
    ];
    if (f.secondaryDocumentId && f.secondaryPageNumber) {
      evidenceRefs.push({
        documentId: f.secondaryDocumentId,
        documentName:
          docMap.get(f.secondaryDocumentId)?.displayName ||
          f.secondaryDocumentId,
        pageNumber: f.secondaryPageNumber,
        label: 'Secondary Compare Region',
        bbox: f.secondaryBbox,
      });
    }

    return {
      id: f.id,
      checkId: f.linkedCheckExecutionIds[0] || f.observationType,
      category: f.observationType,
      outcome: f.outcome,
      severity: f.severity,
      title: f.title,
      summary: f.summary,
      uncertainty: f.uncertainty,
      disposition: f.disposition,
      dispositionActor: f.dispositionActor,
      dispositionReason: f.dispositionReason,
      dispositionUpdatedAt: f.dispositionAt,
      validationState,
      alternativeExplanationsCount: f.alternativeExplanations.length,
      alternativeExplanations: f.alternativeExplanations.map((alt) => ({
        title: alt.title,
        status: alt.status,
        rationale: alt.rationale,
        remainingUncertainty: alt.remainingUncertainty,
      })),
      evidenceRefs,
    };
  };

  const allMappedFindings = params.findings.map(mapFindingItem);
  const exportedFindings = validatedOnly
    ? allMappedFindings.filter(
        (f) =>
          f.validationState === 'reviewer-validated' ||
          f.validationState === 'system-consistent'
      )
    : allMappedFindings;

  const exportedAt = new Date().toISOString();
  const exportedBy = params.exportedBy || 'reviewer-local';

  const bundlePayload = {
    schemaVersion: 'prooflens-dossier-export-v2.0' as const,
    exportedAt,
    exportedBy,
    exportScope: {
      validatedOnly,
      includeFullAuditChain,
      includeFieldRevisionHistory,
    },
    caseMetadata: {
      caseId: params.caseRecord.id,
      caseTitle: params.caseRecord.title,
      applicantName: params.caseRecord.applicantName,
      referenceCode: params.caseRecord.referenceCode,
      scenarioTag: params.caseRecord.scenarioTag,
    },
    runMetadata: {
      runId: params.run.id,
      runNumber: params.run.runNumber,
      status: params.run.status,
      revisionFingerprint: params.run.revisionFingerprint,
      startedAt: params.run.startedAt,
      completedAt: params.run.completedAt,
    },
    reportSnapshot: params.reportSnapshot,
    validatedFindingsSummary: {
      totalFindingsInRun: allMappedFindings.length,
      exportedFindingsCount: exportedFindings.length,
      reviewerValidatedCount: exportedFindings.filter(
        (f) => f.validationState === 'reviewer-validated'
      ).length,
      systemConsistentCount: exportedFindings.filter(
        (f) => f.validationState === 'system-consistent'
      ).length,
      discrepancyCount: exportedFindings.filter(
        (f) => f.outcome === 'discrepancy'
      ).length,
      possibleExplanationCount: exportedFindings.filter(
        (f) => f.outcome === 'possible-explanation'
      ).length,
      insufficientEvidenceCount: exportedFindings.filter(
        (f) => f.outcome === 'insufficient-evidence'
      ).length,
    },
    validatedFindings: exportedFindings,
    auditHistory: {
      verificationStatus: params.verification.status,
      checkedEventsCount: params.verification.checkedEventsCount,
      latestSequence: params.verification.latestSequence,
      latestHeadHash: params.verification.latestHeadHash,
      verifiedAt: params.verification.verifiedAt,
      cannotEstablishNote: params.verification.cannotEstablishNote,
      checkpoint: params.verification.checkpoint,
      fileIntegrityChecks: params.verification.fileIntegrityChecks,
      discrepancies: params.verification.discrepancies,
      events: includeFullAuditChain ? params.auditEvents : [],
      reviewerActions: includeFullAuditChain ? params.reviewActions : [],
      fieldRevisions: includeFieldRevisionHistory ? params.fieldRevisions : [],
    },
  };

  const bundleDigestSha256 = crypto
    .createHash('sha256')
    .update(canonicalJson(bundlePayload), 'utf8')
    .digest('hex');

  return {
    ...bundlePayload,
    bundleDigestSha256,
  };
}

