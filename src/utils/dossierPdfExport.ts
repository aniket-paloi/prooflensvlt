import { jsPDF } from 'jspdf';
import type {
  DossierExportBundle,
  ReportArtifact,
} from '../types/prooflens';

export function downloadDossierBundleAsPdf(bundle: DossierExportBundle): void {
  const report = bundle.reportSnapshot;
  const caseTitle = bundle.caseMetadata.caseTitle;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const maxWidth = 612 - margin * 2;
  let y = 52;

  const ensurePage = (neededHeight = 36) => {
    if (y + neededHeight > 744) {
      doc.addPage();
      y = 52;
    }
  };

  const addHeading = (title: string) => {
    ensurePage(42);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title.replace(/₹/g, 'INR '), margin, y);
    y += 6;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, 612 - margin, y);
    y += 14;
  };

  const addBody = (text: string, mono = false, indent = 0) => {
    doc.setFont(mono ? 'courier' : 'helvetica', 'normal');
    doc.setFontSize(mono ? 8.2 : 9.2);
    doc.setTextColor(51, 65, 85);
    const pdfSafeText = text.replace(/₹/g, 'INR ');
    const lines = doc.splitTextToSize(pdfSafeText, maxWidth - indent) as string[];
    for (const line of lines) {
      ensurePage(14);
      doc.text(line, margin + indent, y);
      y += 12.5;
    }
  };

  // Cover Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(15, 23, 42);
  doc.text('ProofLens — Evidence-Driven Investigation Dossier', margin, y);
  y += 17;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Case: ${caseTitle}  |  Subject: ${bundle.caseMetadata.applicantName} (${bundle.caseMetadata.referenceCode})`,
    margin,
    y
  );
  y += 13;
  doc.text(
    `Report ID: ${report.id}  |  Status: ${report.status.toUpperCase()}  |  Exported: ${bundle.exportedAt} by ${bundle.exportedBy}`,
    margin,
    y
  );
  y += 13;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8.2);
  doc.text(
    `Run: ${report.runId} (Run #${bundle.runMetadata.runNumber})  |  Revision Fingerprint: ${report.revisionFingerprint}`,
    margin,
    y
  );
  y += 12;
  doc.text(
    `Report SHA-256: ${report.reportHash.slice(0, 28)}...  |  Bundle SHA-256: ${bundle.bundleDigestSha256.slice(0, 24)}...`,
    margin,
    y
  );
  y += 10;

  if (report.status === 'superseded' && report.supersededReason) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    addBody(`SUPERSEDED NOTICE: ${report.supersededReason}`);
  }

  // Section 1: Document Overview
  addHeading('1. Document Overview & Ingestion Hashes');
  addBody(report.sections.documentOverview.summary);
  y += 4;
  for (const d of report.sections.documentOverview.documents) {
    addBody(
      `• ${d.displayName} [${d.docClass}, ${d.pageCount}p, ${d.routing}] — SHA-256: ${d.sha256}`,
      true,
      8
    );
  }

  // Section 2: Extracted Information
  addHeading('2. Extracted Information & Claim Semantics');
  addBody(report.sections.extractedInformation.summary);
  y += 4;
  for (const f of report.sections.extractedInformation.fields.slice(0, 25)) {
    addBody(
      `• ${f.label}: Raw="${f.rawValue}" | Norm="${f.normalizedValue}" (${f.basis}/${f.unit}, ${f.period}) [${f.sourceRef}]`,
      false,
      8
    );
  }

  // Section 3: Contextual & Financial Analysis
  addHeading('3. Contextual & Financial Analysis (Decimal Arithmetic)');
  addBody(report.sections.contextualAnalysis.summary);
  y += 4;
  for (const calc of report.sections.contextualAnalysis.calculations) {
    addBody(`• ${calc}`, true, 8);
  }
  if (report.sections.contextualAnalysis.alternatives.length > 0) {
    y += 4;
    addBody('Alternative Explanations Evaluated:');
    for (const alt of report.sections.contextualAnalysis.alternatives) {
      addBody(`- ${alt}`, false, 10);
    }
  }
  if (report.sections.contextualAnalysis.scopedNegativeEvidence.length > 0) {
    y += 4;
    addBody('Scoped Negative Evidence:');
    for (const sne of report.sections.contextualAnalysis.scopedNegativeEvidence) {
      addBody(`- ${sne}`, false, 10);
    }
  }

  // Section 4: Visual & Text-Layer Forensic Findings
  addHeading('4. Visual & Text-Layer Forensic Findings');
  addBody(report.sections.visualForensicFindings.summary);
  y += 4;
  if (report.sections.visualForensicFindings.observations.length === 0) {
    addBody(
      '• No visual anomalies or native/rendered text conflicts observed.',
      false,
      8
    );
  } else {
    for (const obs of report.sections.visualForensicFindings.observations) {
      addBody(
        `• [${obs.sourceRef}] ${obs.method} — ${obs.measured} (Signal: ${obs.strength}) | Limits: ${obs.limits}`,
        false,
        8
      );
    }
  }

  // Section 5: Evidence & Traceability Index
  addHeading('5. Evidence & Traceability Index');
  addBody(report.sections.evidenceTraceability.summary);
  y += 4;
  for (const p of report.sections.evidenceTraceability.provenance) {
    addBody(`• Provenance: ${p}`, false, 8);
  }
  for (const t of report.sections.evidenceTraceability.agentTraces) {
    addBody(`• Bounded Agent Trace: ${t}`, true, 8);
  }
  for (const r of report.sections.evidenceTraceability.reviewerDispositions) {
    addBody(`• Reviewer Action: ${r}`, false, 8);
  }

  // Section 6: Investigation Summary & Limitations
  addHeading('6. Investigation Summary, Coverage & Limitations');
  addBody(report.sections.investigationSummary.summary);
  y += 4;
  addBody(
    `Coverage Matrix: ${report.sections.investigationSummary.coverageSummary}`,
    true,
    4
  );
  y += 4;
  addBody('Uninspected Regions:');
  for (const u of report.sections.investigationSummary.uninspectedRegions.slice(
    0,
    8
  )) {
    addBody(`- ${u}`, false, 10);
  }
  y += 4;
  addBody('Explicit Investigation Boundaries & Non-Certification Notice:');
  for (const lim of report.sections.investigationSummary.limitations) {
    addBody(`- ${lim}`, false, 10);
  }

  // Section 7: Validated Findings & Reviewer Dispositions Register
  addHeading(
    `7. Validated Findings & Dispositions Register (${bundle.validatedFindings.length} Exported)`
  );
  addBody(
    `Summary: ${bundle.validatedFindingsSummary.exportedFindingsCount} of ${bundle.validatedFindingsSummary.totalFindingsInRun} finding(s) included (${bundle.validatedFindingsSummary.reviewerValidatedCount} reviewer-validated, ${bundle.validatedFindingsSummary.systemConsistentCount} system-consistent, ${bundle.validatedFindingsSummary.discrepancyCount} discrepancy, ${bundle.validatedFindingsSummary.possibleExplanationCount} possible-explanation, ${bundle.validatedFindingsSummary.insufficientEvidenceCount} insufficient-evidence).`
  );
  y += 4;
  if (bundle.validatedFindings.length === 0) {
    addBody('• No findings matched the selected validation filter.', false, 8);
  } else {
    for (const fnd of bundle.validatedFindings) {
      ensurePage(54);
      addBody(
        `• [${fnd.id} | ${fnd.checkId}] ${fnd.title} — Outcome: ${fnd.outcome.toUpperCase()} | Validation: ${fnd.validationState} | Disposition: ${fnd.disposition}`,
        true,
        4
      );
      addBody(`  Summary: ${fnd.summary}`, false, 10);
      addBody(`  Uncertainty: ${fnd.uncertainty}`, false, 10);
      if (fnd.dispositionReason) {
        addBody(
          `  Reviewer Note (${fnd.dispositionActor || 'reviewer'}): "${fnd.dispositionReason}"`,
          false,
          10
        );
      }
      if (fnd.evidenceRefs.length > 0) {
        const refs = fnd.evidenceRefs
          .map((r) => `${r.documentName} p.${r.pageNumber} (${r.label})`)
          .join('; ');
        addBody(`  Source Evidence Coordinates: ${refs}`, true, 10);
      }
      y += 3;
    }
  }

  // Section 8: Full Cryptographic Audit History & Chain Verification
  addHeading(
    `8. Full Cryptographic Audit History & SHA-256 Chain (${bundle.auditHistory.events.length} Events)`
  );
  addBody(
    `Integrity Status: ${bundle.auditHistory.verificationStatus} | Checked Events: ${bundle.auditHistory.checkedEventsCount} | Latest Sequence: #${bundle.auditHistory.latestSequence} | Verified At: ${bundle.auditHistory.verifiedAt}`
  );
  addBody(
    `Head Event SHA-256: ${bundle.auditHistory.latestHeadHash}`,
    true,
    4
  );
  if (bundle.auditHistory.checkpoint) {
    addBody(
      `Retained Checkpoint Anchor: seq #${bundle.auditHistory.checkpoint.lastSequence} | Head=${bundle.auditHistory.checkpoint.headHash.slice(0, 24)}... (${bundle.auditHistory.checkpoint.snapshotTime})`,
      true,
      4
    );
  }
  y += 4;
  addBody('Original Document Byte SHA-256 Verification:');
  for (const fc of bundle.auditHistory.fileIntegrityChecks) {
    addBody(
      `- ${fc.displayName} (${fc.documentId}): ${fc.matches ? 'MATCH' : 'MISMATCH'} | Expected=${fc.expectedSha256.slice(0, 20)}... | Actual=${fc.actualSha256.slice(0, 20)}...`,
      true,
      8
    );
  }

  if (bundle.auditHistory.fieldRevisions.length > 0) {
    y += 4;
    addBody(
      `Field Revision History (${bundle.auditHistory.fieldRevisions.length} record(s)):`
    );
    for (const rev of bundle.auditHistory.fieldRevisions.slice(0, 30)) {
      addBody(
        `- [rev #${rev.revisionNumber} on ${rev.fieldId}] "${rev.previousValue}" -> "${rev.newValue}" by ${rev.actor} (${rev.reason}) at ${rev.createdAt}`,
        true,
        8
      );
    }
  }

  if (bundle.auditHistory.events.length > 0) {
    y += 4;
    addBody('Chronological Hash-Linked Audit Event Chain:');
    for (const ev of bundle.auditHistory.events) {
      ensurePage(32);
      addBody(
        `#${ev.sequence} [${ev.createdAt}] ${ev.eventType} by ${ev.actor} | prev=${ev.prevHash.slice(0, 12)}... -> hash=${ev.eventHash.slice(0, 16)}...`,
        true,
        6
      );
      addBody(`   payload: ${ev.payloadCanonicalJson}`, true, 10);
    }
  }

  const safeSlug = caseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  doc.save(`ProofLens_Dossier_${safeSlug}_${report.id}.pdf`);
}

export function downloadDossierBundleAsJson(bundle: DossierExportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSlug = bundle.caseMetadata.caseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  a.href = url;
  a.download = `ProofLens_Dossier_${safeSlug}_${bundle.reportSnapshot.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDossierAsPdf(
  report: ReportArtifact,
  caseTitle: string
): void {
  // Fallback wrapper when exporting a standalone ReportArtifact
  const fallbackBundle: DossierExportBundle = {
    schemaVersion: 'prooflens-dossier-export-v2.0',
    exportedAt: new Date().toISOString(),
    exportedBy: report.generatedBy,
    exportScope: {
      validatedOnly: false,
      includeFullAuditChain: true,
      includeFieldRevisionHistory: true,
    },
    caseMetadata: {
      caseId: report.caseId,
      caseTitle,
      applicantName: 'Case Subject',
      referenceCode: report.caseId,
      scenarioTag: 'consistent',
    },
    runMetadata: {
      runId: report.runId,
      runNumber: 1,
      status: 'complete',
      revisionFingerprint: report.revisionFingerprint,
      startedAt: report.generatedAt,
      completedAt: report.generatedAt,
    },
    reportSnapshot: report,
    validatedFindingsSummary: {
      totalFindingsInRun: 0,
      exportedFindingsCount: 0,
      reviewerValidatedCount: 0,
      systemConsistentCount: 0,
      discrepancyCount: 0,
      possibleExplanationCount: 0,
      insufficientEvidenceCount: 0,
    },
    validatedFindings: [],
    auditHistory: {
      verificationStatus: 'unanchored-no-checkpoint',
      checkedEventsCount: 0,
      latestSequence: 0,
      latestHeadHash: report.reportHash,
      verifiedAt: report.generatedAt,
      cannotEstablishNote: '',
      checkpoint: null,
      fileIntegrityChecks: [],
      discrepancies: [],
      events: [],
      reviewerActions: [],
      fieldRevisions: [],
    },
    bundleDigestSha256: report.reportHash,
  };
  downloadDossierBundleAsPdf(fallbackBundle);
}

export function downloadDossierAsJson(
  report: ReportArtifact,
  caseTitle: string
): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSlug = caseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  a.href = url;
  a.download = `ProofLens_Bundle_${safeSlug}_${report.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
