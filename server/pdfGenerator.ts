/**
 * Deterministic PDF 1.4 generator for ProofLens fictional loan investigation packets.
 * Produces real, valid multi-page PDF files with real byte SHA-256 hashes,
 * explicit /Producer metadata, exact text coordinates, and controlled test conditions
 * (consistent native text, native-vs-rendered text layer disagreement, benign 3 Tr
 * searchable-scan OCR layer, and incomplete multi-page coverage).
 */

export interface PdfTextCommand {
  text: string;
  x: number; // points from left (0..612)
  y: number; // points from bottom (0..792)
  font?: 'F1' | 'F2' | 'F3'; // F1=Helvetica, F2=Helvetica-Bold, F3=Courier
  size?: number;
  renderingMode?: 0 | 3; // 0 = visible fill, 3 = invisible OCR text layer
  highlightRect?: {
    x: number;
    y: number;
    w: number;
    h: number;
    r: number;
    g: number;
    b: number;
  };
}

export interface PdfPageSpec {
  commands: PdfTextCommand[];
  lines?: Array<{ x1: number; y1: number; x2: number; y2: number; width?: number }>;
  rects?: Array<{ x: number; y: number; w: number; h: number; r: number; g: number; b: number; stroke?: boolean }>;
}

function escapePdfString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

export function buildPdfDocument(options: {
  producer: string;
  title: string;
  creator?: string;
  pages: PdfPageSpec[];
}): Buffer {
  const objects: string[] = [];
  const addObj = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // 1: Catalog (placeholder, updated after Pages)
  const catalogId = addObj('');
  // 2: Pages (placeholder)
  const pagesId = addObj('');
  // 3: Font F1 Helvetica
  const f1Id = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  // 4: Font F2 Helvetica-Bold
  const f2Id = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  // 5: Font F3 Courier
  const f3Id = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  // 6: Info dictionary
  const infoId = addObj(
    `<< /Title (${escapePdfString(options.title)}) /Producer (${escapePdfString(
      options.producer
    )}) /Creator (${escapePdfString(options.creator || 'ProofLens Fictional Packet Generator')}) /CreationDate (D:20261015093000Z) >>`
  );

  const pageIds: number[] = [];

  for (const page of options.pages) {
    const streamParts: string[] = [];

    // Subtle synthetic watermark header on every generated fictional document
    streamParts.push('q');
    streamParts.push('0.96 0.97 0.99 rg');
    streamParts.push('36 744 540 24 re f');
    streamParts.push('Q');

    if (page.rects) {
      for (const rect of page.rects) {
        streamParts.push('q');
        streamParts.push(`${rect.r.toFixed(3)} ${rect.g.toFixed(3)} ${rect.b.toFixed(3)} rg`);
        streamParts.push(`${rect.x.toFixed(2)} ${rect.y.toFixed(2)} ${rect.w.toFixed(2)} ${rect.h.toFixed(2)} re ${rect.stroke ? 'B' : 'f'}`);
        streamParts.push('Q');
      }
    }

    if (page.lines) {
      for (const line of page.lines) {
        streamParts.push('q');
        streamParts.push('0.82 0.85 0.90 RG');
        streamParts.push(`${(line.width || 0.75).toFixed(2)} w`);
        streamParts.push(`${line.x1.toFixed(2)} ${line.y1.toFixed(2)} m ${line.x2.toFixed(2)} ${line.y2.toFixed(2)} l S`);
        streamParts.push('Q');
      }
    }

    for (const cmd of page.commands) {
      if (cmd.highlightRect) {
        const hr = cmd.highlightRect;
        streamParts.push('q');
        streamParts.push(`${hr.r.toFixed(3)} ${hr.g.toFixed(3)} ${hr.b.toFixed(3)} rg`);
        streamParts.push(`${hr.x.toFixed(2)} ${hr.y.toFixed(2)} ${hr.w.toFixed(2)} ${hr.h.toFixed(2)} re f`);
        streamParts.push('Q');
      }
      const font = cmd.font || 'F1';
      const size = cmd.size || 10;
      const tr = cmd.renderingMode ?? 0;
      streamParts.push('BT');
      streamParts.push(`/${font} ${size.toFixed(1)} Tf`);
      if (tr !== 0) {
        streamParts.push(`${tr} Tr`);
      }
      streamParts.push('0.06 0.09 0.16 rg');
      streamParts.push(`1 0 0 1 ${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)} Tm`);
      streamParts.push(`(${escapePdfString(cmd.text)}) Tj`);
      if (tr !== 0) {
        streamParts.push('0 Tr');
      }
      streamParts.push('ET');
    }

    const streamContent = streamParts.join('\n');
    const contentId = addObj(
      `<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream`
    );

    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R /F3 ${f3Id} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const chunks: string[] = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
  const offsets: number[] = [0];
  let currentOffset = Buffer.byteLength(chunks[0], 'latin1');

  for (let i = 0; i < objects.length; i++) {
    offsets.push(currentOffset);
    const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(objStr);
    currentOffset += Buffer.byteLength(objStr, 'latin1');
  }

  const xrefStart = currentOffset;
  const xrefLines: string[] = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(xrefLines.join(''));
  chunks.push(trailer);

  return Buffer.from(chunks.join(''), 'latin1');
}

export interface GeneratedFictionalDocument {
  displayName: string;
  buffer: Buffer;
}

export function buildCanonicalFictionalPackets(): Array<{
  caseId: string;
  title: string;
  applicantName: string;
  referenceCode: string;
  scenarioTag: 'consistent' | 'discrepancy-visual' | 'split-payment' | 'incomplete-coverage';
  summary: string;
  documents: GeneratedFictionalDocument[];
}> {
  // 1. Consistent Loan Packet — Aarav Sharma (SBI / Infosys FinTech Solutions Pvt. Ltd.)
  const sharmaApp = buildPdfDocument({
    producer: 'Bharat Retail Loan Portal PDF Engine 3.1',
    title: 'Personal & Housing Loan Application - Aarav Sharma',
    pages: [
      {
        rects: [{ x: 40, y: 540, w: 532, h: 175, r: 0.97, g: 0.98, b: 0.99 }],
        lines: [{ x1: 40, y1: 715, x2: 572, y2: 715 }],
        commands: [
          { text: 'FICTIONAL RETAIL LOAN APPLICATION FORM (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'Retail Credit & Housing Finance Intake Form (INR)', x: 40, y: 724, font: 'F2', size: 15 },
          { text: 'Application Reference:', x: 52, y: 690, font: 'F2', size: 10 },
          { text: 'APP-IND-2026-014', x: 220, y: 690, font: 'F3', size: 10 },
          { text: 'Applicant Full Name:', x: 52, y: 668, font: 'F2', size: 10 },
          { text: 'Aarav Sharma', x: 220, y: 668, font: 'F1', size: 10 },
          { text: 'Current Employer:', x: 52, y: 646, font: 'F2', size: 10 },
          { text: 'Infosys FinTech Solutions Pvt. Ltd.', x: 220, y: 646, font: 'F1', size: 10 },
          { text: 'Declared Gross Monthly Income:', x: 52, y: 624, font: 'F2', size: 10 },
          { text: 'INR 85,000.00', x: 220, y: 624, font: 'F3', size: 10 },
          { text: 'Declared Net Monthly Income:', x: 52, y: 602, font: 'F2', size: 10 },
          { text: 'INR 66,300.00', x: 220, y: 602, font: 'F3', size: 10 },
          { text: 'Declaration Period:', x: 52, y: 580, font: 'F2', size: 10 },
          { text: '2026-09 (Monthly)', x: 220, y: 580, font: 'F1', size: 10 },
          { text: 'Requested Facility Amount:', x: 52, y: 558, font: 'F2', size: 10 },
          { text: 'INR 18,00,000.00', x: 220, y: 558, font: 'F3', size: 10 },
        ],
      },
    ],
  });

  const makeSharmaSlip = (monthLabel: string, periodIso: string, payDate: string) =>
    buildPdfDocument({
      producer: 'Infosys FinTech HRMS Payroll Exporter 4.0',
      title: `Salary Slip ${monthLabel} - Aarav Sharma`,
      pages: [
        {
          rects: [{ x: 40, y: 490, w: 532, h: 215, r: 0.97, g: 0.98, b: 0.99 }],
          lines: [
            { x1: 40, y1: 715, x2: 572, y2: 715 },
            { x1: 48, y1: 562, x2: 560, y2: 562 },
          ],
          commands: [
            { text: 'FICTIONAL MONTHLY PAYSLIP STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
            { text: 'Infosys FinTech Solutions Pvt. Ltd. — Monthly Salary Advice', x: 40, y: 724, font: 'F2', size: 13.5 },
            { text: 'Employee Name:', x: 52, y: 684, font: 'F2', size: 10 },
            { text: 'Aarav Sharma', x: 210, y: 684, font: 'F1', size: 10 },
            { text: 'Employer Name:', x: 52, y: 662, font: 'F2', size: 10 },
            { text: 'Infosys FinTech Solutions Pvt. Ltd.', x: 210, y: 662, font: 'F1', size: 10 },
            { text: 'Pay Period:', x: 52, y: 640, font: 'F2', size: 10 },
            { text: periodIso, x: 210, y: 640, font: 'F3', size: 10 },
            { text: 'Payment Date:', x: 52, y: 618, font: 'F2', size: 10 },
            { text: payDate, x: 210, y: 618, font: 'F3', size: 10 },
            { text: 'Gross Pay:', x: 52, y: 586, font: 'F2', size: 10 },
            { text: 'INR 85,000.00', x: 210, y: 586, font: 'F3', size: 10 },
            { text: 'Total Deductions:', x: 52, y: 540, font: 'F2', size: 10 },
            { text: 'INR 18,700.00', x: 210, y: 540, font: 'F3', size: 10 },
            { text: 'Net Pay:', x: 52, y: 512, font: 'F2', size: 10 },
            { text: 'INR 66,300.00', x: 210, y: 512, font: 'F3', size: 10 },
          ],
        },
      ],
    });

  const sharmaBank = buildPdfDocument({
    producer: 'State Bank of India Core Statement Engine 8.4',
    title: 'SBI Bank Statement Q3 2026 - Aarav Sharma',
    pages: [
      {
        rects: [{ x: 40, y: 575, w: 532, h: 32, r: 0.94, g: 0.96, b: 0.99 }],
        lines: [
          { x1: 40, y1: 715, x2: 572, y2: 715 },
          { x1: 40, y1: 575, x2: 572, y2: 575 },
          { x1: 40, y1: 410, x2: 572, y2: 410 },
        ],
        commands: [
          { text: 'FICTIONAL BANK ACCOUNT STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'State Bank of India (SBI) Savings Statement — Page 1 of 1', x: 40, y: 724, font: 'F2', size: 14 },
          { text: 'Account Holder:', x: 44, y: 690, font: 'F2', size: 10 },
          { text: 'Aarav Sharma', x: 165, y: 690, font: 'F1', size: 10 },
          { text: 'Account Number:', x: 335, y: 690, font: 'F2', size: 10 },
          { text: 'SBIN-0048841209', x: 438, y: 690, font: 'F3', size: 10 },
          { text: 'Statement Period:', x: 44, y: 668, font: 'F2', size: 10 },
          { text: '2026-07-01 to 2026-09-30', x: 165, y: 668, font: 'F3', size: 10 },
          { text: 'Opening Balance:', x: 44, y: 644, font: 'F2', size: 10 },
          { text: 'INR 1,42,000.00', x: 165, y: 644, font: 'F3', size: 10 },
          { text: 'Closing Balance:', x: 335, y: 644, font: 'F2', size: 10 },
          { text: 'INR 2,68,900.00', x: 438, y: 644, font: 'F3', size: 10 },
          // Table headers
          { text: 'Date', x: 44, y: 586, font: 'F2', size: 9 },
          { text: 'Narration', x: 108, y: 586, font: 'F2', size: 9 },
          { text: 'Debit', x: 332, y: 586, font: 'F2', size: 9 },
          { text: 'Credit', x: 414, y: 586, font: 'F2', size: 9 },
          { text: 'Balance', x: 494, y: 586, font: 'F2', size: 9 },
          // Rows
          { text: '2026-07-31', x: 44, y: 554, font: 'F3', size: 8.5 },
          { text: 'NEFT Salary Credit Infosys FinTech Solutions', x: 108, y: 554, font: 'F1', size: 8.5 },
          { text: '-', x: 332, y: 554, font: 'F3', size: 8.5 },
          { text: 'INR 66,300.00', x: 414, y: 554, font: 'F3', size: 8.5 },
          { text: 'INR 2,08,300.00', x: 494, y: 554, font: 'F3', size: 8.5 },

          { text: '2026-08-12', x: 44, y: 530, font: 'F3', size: 8.5 },
          { text: 'UPI Koramangala Society Maintenance & Rent', x: 108, y: 530, font: 'F1', size: 8.5 },
          { text: 'INR 24,000.00', x: 332, y: 530, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 530, font: 'F3', size: 8.5 },
          { text: 'INR 1,84,300.00', x: 494, y: 530, font: 'F3', size: 8.5 },

          { text: '2026-08-31', x: 44, y: 506, font: 'F3', size: 8.5 },
          { text: 'NEFT Salary Credit Infosys FinTech Solutions', x: 108, y: 506, font: 'F1', size: 8.5 },
          { text: '-', x: 332, y: 506, font: 'F3', size: 8.5 },
          { text: 'INR 66,300.00', x: 414, y: 506, font: 'F3', size: 8.5 },
          { text: 'INR 2,50,600.00', x: 494, y: 506, font: 'F3', size: 8.5 },

          { text: '2026-09-14', x: 44, y: 482, font: 'F3', size: 8.5 },
          { text: 'BBPS BESCOM Electricity & Broadband Bill', x: 108, y: 482, font: 'F1', size: 8.5 },
          { text: 'INR 24,000.00', x: 332, y: 482, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 482, font: 'F3', size: 8.5 },
          { text: 'INR 2,26,600.00', x: 494, y: 482, font: 'F3', size: 8.5 },

          { text: '2026-09-30', x: 44, y: 458, font: 'F3', size: 8.5 },
          { text: 'NEFT Salary Credit Infosys FinTech Solutions', x: 108, y: 458, font: 'F1', size: 8.5 },
          { text: '-', x: 332, y: 458, font: 'F3', size: 8.5 },
          { text: 'INR 66,300.00', x: 414, y: 458, font: 'F3', size: 8.5 },
          { text: 'INR 2,92,900.00', x: 494, y: 458, font: 'F3', size: 8.5 },

          { text: '2026-09-30', x: 44, y: 434, font: 'F3', size: 8.5 },
          { text: 'NACH Auto Loan EMI Scheduled Debit', x: 108, y: 434, font: 'F1', size: 8.5 },
          { text: 'INR 24,000.00', x: 332, y: 434, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 434, font: 'F3', size: 8.5 },
          { text: 'INR 2,68,900.00', x: 494, y: 434, font: 'F3', size: 8.5 },
        ],
      },
    ],
  });

  // 2. Suspicious Packet — Vikram Deshmukh (Altered Salary + Native/Rendered Disagreement + Font/Baseline Anomaly)
  const deshmukhApp = buildPdfDocument({
    producer: 'Bharat Retail Loan Portal PDF Engine 3.1',
    title: 'Personal & Housing Loan Application - Vikram Deshmukh',
    pages: [
      {
        rects: [{ x: 40, y: 540, w: 532, h: 175, r: 0.97, g: 0.98, b: 0.99 }],
        lines: [{ x1: 40, y1: 715, x2: 572, y2: 715 }],
        commands: [
          { text: 'FICTIONAL RETAIL LOAN APPLICATION FORM (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'Retail Credit & Housing Finance Intake Form (INR)', x: 40, y: 724, font: 'F2', size: 15 },
          { text: 'Application Reference:', x: 52, y: 690, font: 'F2', size: 10 },
          { text: 'APP-IND-2026-019', x: 220, y: 690, font: 'F3', size: 10 },
          { text: 'Applicant Full Name:', x: 52, y: 668, font: 'F2', size: 10 },
          { text: 'Vikram Deshmukh', x: 220, y: 668, font: 'F1', size: 10 },
          { text: 'Current Employer:', x: 52, y: 646, font: 'F2', size: 10 },
          { text: 'Bharat Freight Logistics Pvt. Ltd.', x: 220, y: 646, font: 'F1', size: 10 },
          { text: 'Declared Gross Monthly Income:', x: 52, y: 624, font: 'F2', size: 10 },
          { text: 'INR 1,40,000.00', x: 220, y: 624, font: 'F3', size: 10 },
          { text: 'Declared Net Monthly Income:', x: 52, y: 602, font: 'F2', size: 10 },
          { text: 'INR 1,12,000.00', x: 220, y: 602, font: 'F3', size: 10 },
          { text: 'Declaration Period:', x: 52, y: 580, font: 'F2', size: 10 },
          { text: '2026-08 (Monthly)', x: 220, y: 580, font: 'F1', size: 10 },
          { text: 'Requested Facility Amount:', x: 52, y: 558, font: 'F2', size: 10 },
          { text: 'INR 31,00,000.00', x: 220, y: 558, font: 'F3', size: 10 },
        ],
      },
    ],
  });

  const deshmukhSlip = buildPdfDocument({
    producer: 'Desktop PDF Overlay Editor 1.9 (Post-Export Modified)',
    title: 'Salary Slip August 2026 - Vikram Deshmukh',
    pages: [
      {
        rects: [{ x: 40, y: 490, w: 532, h: 215, r: 0.97, g: 0.98, b: 0.99 }],
        lines: [
          { x1: 40, y1: 715, x2: 572, y2: 715 },
          { x1: 48, y1: 562, x2: 560, y2: 562 },
        ],
        commands: [
          { text: 'FICTIONAL MONTHLY PAYSLIP STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'Bharat Freight Logistics Pvt. Ltd. — Monthly Salary Advice', x: 40, y: 724, font: 'F2', size: 13.5 },
          { text: 'Employee Name:', x: 52, y: 684, font: 'F2', size: 10 },
          { text: 'Vikram Deshmukh', x: 210, y: 684, font: 'F1', size: 10 },
          { text: 'Employer Name:', x: 52, y: 662, font: 'F2', size: 10 },
          { text: 'Bharat Freight Logistics Pvt. Ltd.', x: 210, y: 662, font: 'F1', size: 10 },
          { text: 'Pay Period:', x: 52, y: 640, font: 'F2', size: 10 },
          { text: '2026-08', x: 210, y: 640, font: 'F3', size: 10 },
          { text: 'Payment Date:', x: 52, y: 618, font: 'F2', size: 10 },
          { text: '2026-08-31', x: 210, y: 618, font: 'F3', size: 10 },
          { text: 'Gross Pay:', x: 52, y: 586, font: 'F2', size: 10 },
          { text: 'INR 85,000.00', x: 210, y: 586, font: 'F3', size: 10 },
          { text: 'Total Deductions:', x: 52, y: 540, font: 'F2', size: 10 },
          { text: 'INR 17,000.00', x: 210, y: 540, font: 'F3', size: 10 },
          { text: 'Net Pay:', x: 52, y: 512, font: 'F2', size: 10 },
          // Underlying native text span (3 Tr) holding original INR 68,000.00
          { text: 'INR 68,000.00', x: 210, y: 512, font: 'F3', size: 10, renderingMode: 3 },
          // Visible rendered replacement in Helvetica-Bold shifted +1.8pt with contrast patch
          {
            text: 'INR 1,12,000.00',
            x: 210,
            y: 513.8,
            font: 'F2',
            size: 11.5,
            renderingMode: 0,
            highlightRect: { x: 206, y: 507, w: 98, h: 17, r: 0.91, g: 0.94, b: 0.98 },
          },
        ],
      },
    ],
  });

  const deshmukhBank = buildPdfDocument({
    producer: 'HDFC Bank Core Statement Engine 6.2',
    title: 'HDFC Bank Statement August 2026 - Vikram Deshmukh',
    pages: [
      {
        rects: [{ x: 40, y: 575, w: 532, h: 32, r: 0.94, g: 0.96, b: 0.99 }],
        lines: [
          { x1: 40, y1: 715, x2: 572, y2: 715 },
          { x1: 40, y1: 575, x2: 572, y2: 575 },
          { x1: 40, y1: 482, x2: 572, y2: 482 },
        ],
        commands: [
          { text: 'FICTIONAL BANK ACCOUNT STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'HDFC Bank Savings Account Statement — Page 1 of 1', x: 40, y: 724, font: 'F2', size: 14 },
          { text: 'Account Holder:', x: 44, y: 690, font: 'F2', size: 10 },
          { text: 'Vikram Deshmukh', x: 165, y: 690, font: 'F1', size: 10 },
          { text: 'Account Number:', x: 335, y: 690, font: 'F2', size: 10 },
          { text: 'HDFC-005520914', x: 438, y: 690, font: 'F3', size: 10 },
          { text: 'Statement Period:', x: 44, y: 668, font: 'F2', size: 10 },
          { text: '2026-08-01 to 2026-08-31', x: 165, y: 668, font: 'F3', size: 10 },
          { text: 'Opening Balance:', x: 44, y: 644, font: 'F2', size: 10 },
          { text: 'INR 94,500.00', x: 165, y: 644, font: 'F3', size: 10 },
          { text: 'Closing Balance:', x: 335, y: 644, font: 'F2', size: 10 },
          { text: 'INR 1,31,500.00', x: 438, y: 644, font: 'F3', size: 10 },
          // Table headers
          { text: 'Date', x: 44, y: 586, font: 'F2', size: 9 },
          { text: 'Narration', x: 108, y: 586, font: 'F2', size: 9 },
          { text: 'Debit', x: 332, y: 586, font: 'F2', size: 9 },
          { text: 'Credit', x: 414, y: 586, font: 'F2', size: 9 },
          { text: 'Balance', x: 494, y: 586, font: 'F2', size: 9 },
          // Rows
          { text: '2026-08-05', x: 44, y: 554, font: 'F3', size: 8.5 },
          { text: 'NEFT Powai Residency Co-op Society Rent', x: 108, y: 554, font: 'F1', size: 8.5 },
          { text: 'INR 21,000.00', x: 332, y: 554, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 554, font: 'F3', size: 8.5 },
          { text: 'INR 73,500.00', x: 494, y: 554, font: 'F3', size: 8.5 },

          { text: '2026-08-19', x: 44, y: 530, font: 'F3', size: 8.5 },
          { text: 'UPI Reliance Smart & MSEDCL Utility Bill', x: 108, y: 530, font: 'F1', size: 8.5 },
          { text: 'INR 10,000.00', x: 332, y: 530, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 530, font: 'F3', size: 8.5 },
          { text: 'INR 63,500.00', x: 494, y: 530, font: 'F3', size: 8.5 },

          { text: '2026-08-31', x: 44, y: 506, font: 'F3', size: 8.5 },
          { text: 'NEFT Salary Bharat Freight Logistics', x: 108, y: 506, font: 'F1', size: 8.5 },
          { text: '-', x: 332, y: 506, font: 'F3', size: 8.5 },
          { text: 'INR 68,000.00', x: 414, y: 506, font: 'F3', size: 8.5 },
          { text: 'INR 1,31,500.00', x: 494, y: 506, font: 'F3', size: 8.5 },
        ],
      },
    ],
  });

  // 3. Legitimate Split Payment & Gross/Net Alignment + Benign Searchable Scan OCR — Priya Nair
  const nairApp = buildPdfDocument({
    producer: 'Bharat Retail Loan Portal PDF Engine 3.1',
    title: 'Personal & Housing Loan Application - Priya Nair',
    pages: [
      {
        rects: [{ x: 40, y: 540, w: 532, h: 175, r: 0.97, g: 0.98, b: 0.99 }],
        lines: [{ x1: 40, y1: 715, x2: 572, y2: 715 }],
        commands: [
          { text: 'FICTIONAL RETAIL LOAN APPLICATION FORM (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'Retail Credit & Housing Finance Intake Form (INR)', x: 40, y: 724, font: 'F2', size: 15 },
          { text: 'Application Reference:', x: 52, y: 690, font: 'F2', size: 10 },
          { text: 'APP-IND-2026-023', x: 220, y: 690, font: 'F3', size: 10 },
          { text: 'Applicant Full Name:', x: 52, y: 668, font: 'F2', size: 10 },
          { text: 'Priya Nair', x: 220, y: 668, font: 'F1', size: 10 },
          { text: 'Current Employer:', x: 52, y: 646, font: 'F2', size: 10 },
          { text: 'Biocon Lifesciences India Ltd.', x: 220, y: 646, font: 'F1', size: 10 },
          { text: 'Declared Annual Gross Income:', x: 52, y: 624, font: 'F2', size: 10 },
          { text: 'INR 9,00,000.00', x: 220, y: 624, font: 'F3', size: 10 },
          { text: 'Declaration Period:', x: 52, y: 602, font: 'F2', size: 10 },
          { text: '2026 (Annual)', x: 220, y: 602, font: 'F1', size: 10 },
          { text: 'Requested Facility Amount:', x: 52, y: 580, font: 'F2', size: 10 },
          { text: 'INR 15,00,000.00', x: 220, y: 580, font: 'F3', size: 10 },
        ],
      },
    ],
  });

  const nairSlip = buildPdfDocument({
    producer: 'Biocon Lifesciences SAP Payroll Export 5.0',
    title: 'Salary Slip September 2026 - Priya Nair',
    pages: [
      {
        rects: [{ x: 40, y: 490, w: 532, h: 215, r: 0.97, g: 0.98, b: 0.99 }],
        lines: [
          { x1: 40, y1: 715, x2: 572, y2: 715 },
          { x1: 48, y1: 562, x2: 560, y2: 562 },
        ],
        commands: [
          { text: 'FICTIONAL MONTHLY PAYSLIP STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'Biocon Lifesciences India Ltd. — Monthly Salary Advice', x: 40, y: 724, font: 'F2', size: 14 },
          { text: 'Employee Name:', x: 52, y: 684, font: 'F2', size: 10 },
          { text: 'Priya Nair', x: 210, y: 684, font: 'F1', size: 10 },
          { text: 'Employer Name:', x: 52, y: 662, font: 'F2', size: 10 },
          { text: 'Biocon Lifesciences India Ltd.', x: 210, y: 662, font: 'F1', size: 10 },
          { text: 'Pay Period:', x: 52, y: 640, font: 'F2', size: 10 },
          { text: '2026-09', x: 210, y: 640, font: 'F3', size: 10 },
          { text: 'Payment Date:', x: 52, y: 618, font: 'F2', size: 10 },
          { text: '2026-09-30', x: 210, y: 618, font: 'F3', size: 10 },
          { text: 'Gross Pay:', x: 52, y: 586, font: 'F2', size: 10 },
          { text: 'INR 75,000.00', x: 210, y: 586, font: 'F3', size: 10 },
          { text: 'Total Deductions:', x: 52, y: 540, font: 'F2', size: 10 },
          { text: 'INR 15,000.00', x: 210, y: 540, font: 'F3', size: 10 },
          { text: 'Net Pay:', x: 52, y: 512, font: 'F2', size: 10 },
          { text: 'INR 60,000.00', x: 210, y: 512, font: 'F3', size: 10 },
        ],
      },
    ],
  });

  const nairBank = buildPdfDocument({
    producer: 'Document Scanner OCR Pipeline 2.4 (Searchable Scan)',
    title: 'ICICI Bank Statement September 2026 - Priya Nair',
    pages: [
      {
        rects: [{ x: 40, y: 575, w: 532, h: 32, r: 0.94, g: 0.96, b: 0.99 }],
        lines: [
          { x1: 40, y1: 715, x2: 572, y2: 715 },
          { x1: 40, y1: 575, x2: 572, y2: 575 },
          { x1: 40, y1: 482, x2: 572, y2: 482 },
        ],
        commands: [
          { text: 'FICTIONAL BANK ACCOUNT STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'ICICI Bank Savings Account Statement — Page 1 of 1', x: 40, y: 724, font: 'F2', size: 14 },
          { text: 'Account Holder:', x: 44, y: 690, font: 'F2', size: 10 },
          { text: 'Priya Nair', x: 165, y: 690, font: 'F1', size: 10 },
          { text: 'Account Number:', x: 335, y: 690, font: 'F2', size: 10 },
          { text: 'ICIC-003190772', x: 438, y: 690, font: 'F3', size: 10 },
          { text: 'Statement Period:', x: 44, y: 668, font: 'F2', size: 10 },
          { text: '2026-09-01 to 2026-09-30', x: 165, y: 668, font: 'F3', size: 10 },
          { text: 'Opening Balance:', x: 44, y: 644, font: 'F2', size: 10 },
          { text: 'INR 1,18,000.00', x: 165, y: 644, font: 'F3', size: 10 },
          { text: 'Closing Balance:', x: 335, y: 644, font: 'F2', size: 10 },
          { text: 'INR 1,59,500.00', x: 438, y: 644, font: 'F3', size: 10 },
          // Benign searchable-scan OCR shadow layer matching visible text
          { text: 'SEARCHABLE_SCAN_OCR_LAYER_MATCHED', x: 44, y: 622, font: 'F3', size: 8, renderingMode: 3 },
          // Table headers
          { text: 'Date', x: 44, y: 586, font: 'F2', size: 9 },
          { text: 'Narration', x: 108, y: 586, font: 'F2', size: 9 },
          { text: 'Debit', x: 332, y: 586, font: 'F2', size: 9 },
          { text: 'Credit', x: 414, y: 586, font: 'F2', size: 9 },
          { text: 'Balance', x: 494, y: 586, font: 'F2', size: 9 },
          // Rows: Split payroll disbursement (INR 36,000 + INR 24,000 = INR 60,000)
          { text: '2026-09-10', x: 44, y: 554, font: 'F3', size: 8.5 },
          { text: 'UPI Banjara Hills Apartment Rent', x: 108, y: 554, font: 'F1', size: 8.5 },
          { text: 'INR 18,500.00', x: 332, y: 554, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 554, font: 'F3', size: 8.5 },
          { text: 'INR 99,500.00', x: 494, y: 554, font: 'F3', size: 8.5 },

          { text: '2026-09-28', x: 44, y: 530, font: 'F3', size: 8.5 },
          { text: 'NEFT Biocon Lifesciences Payroll Tranche A', x: 108, y: 530, font: 'F1', size: 8.5 },
          { text: '-', x: 332, y: 530, font: 'F3', size: 8.5 },
          { text: 'INR 36,000.00', x: 414, y: 530, font: 'F3', size: 8.5 },
          { text: 'INR 1,35,500.00', x: 494, y: 530, font: 'F3', size: 8.5 },

          { text: '2026-09-30', x: 44, y: 506, font: 'F3', size: 8.5 },
          { text: 'NEFT Biocon Lifesciences Payroll Tranche B', x: 108, y: 506, font: 'F1', size: 8.5 },
          { text: '-', x: 332, y: 506, font: 'F3', size: 8.5 },
          { text: 'INR 24,000.00', x: 414, y: 506, font: 'F3', size: 8.5 },
          { text: 'INR 1,59,500.00', x: 494, y: 506, font: 'F3', size: 8.5 },
        ],
      },
    ],
  });

  // 4. Incomplete Coverage & Shared-Source Provenance — Rohan Kulkarni
  const kulkarniApp = buildPdfDocument({
    producer: 'Bharat Retail Loan Portal PDF Engine 3.1',
    title: 'Personal & Housing Loan Application - Rohan Kulkarni',
    pages: [
      {
        rects: [{ x: 40, y: 540, w: 532, h: 175, r: 0.97, g: 0.98, b: 0.99 }],
        lines: [{ x1: 40, y1: 715, x2: 572, y2: 715 }],
        commands: [
          { text: 'FICTIONAL RETAIL LOAN APPLICATION FORM (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'Retail Credit & Housing Finance Intake Form (INR)', x: 40, y: 724, font: 'F2', size: 15 },
          { text: 'Application Reference:', x: 52, y: 690, font: 'F2', size: 10 },
          { text: 'APP-IND-2026-031', x: 220, y: 690, font: 'F3', size: 10 },
          { text: 'Applicant Full Name:', x: 52, y: 668, font: 'F2', size: 10 },
          { text: 'Rohan Kulkarni', x: 220, y: 668, font: 'F1', size: 10 },
          { text: 'Current Employer:', x: 52, y: 646, font: 'F2', size: 10 },
          { text: 'Sahyadri Infra Works Pvt. Ltd.', x: 220, y: 646, font: 'F1', size: 10 },
          { text: 'Declared Gross Monthly Income:', x: 52, y: 624, font: 'F2', size: 10 },
          { text: 'INR 74,000.00', x: 220, y: 624, font: 'F3', size: 10 },
          { text: 'Declared Net Monthly Income:', x: 52, y: 602, font: 'F2', size: 10 },
          { text: 'INR 59,000.00', x: 220, y: 602, font: 'F3', size: 10 },
          { text: 'Declaration Period:', x: 52, y: 580, font: 'F2', size: 10 },
          { text: '2026-10 (Monthly)', x: 220, y: 580, font: 'F1', size: 10 },
        ],
      },
    ],
  });

  const makeKulkarniSlip = (periodIso: string, payDate: string) =>
    buildPdfDocument({
      producer: 'KekaHR Shared Payroll Template Builder 2.1 (TemplateID:TC-884)',
      title: `Salary Slip ${periodIso} - Rohan Kulkarni`,
      pages: [
        {
          rects: [{ x: 40, y: 490, w: 532, h: 215, r: 0.97, g: 0.98, b: 0.99 }],
          lines: [{ x1: 40, y1: 715, x2: 572, y2: 715 }],
          commands: [
            { text: 'FICTIONAL MONTHLY PAYSLIP STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
            { text: 'Sahyadri Infra Works Pvt. Ltd. — Monthly Salary Advice', x: 40, y: 724, font: 'F2', size: 14 },
            { text: 'Employee Name:', x: 52, y: 684, font: 'F2', size: 10 },
            { text: 'Rohan Kulkarni', x: 210, y: 684, font: 'F1', size: 10 },
            { text: 'Employer Name:', x: 52, y: 662, font: 'F2', size: 10 },
            { text: 'Sahyadri Infra Works Pvt. Ltd.', x: 210, y: 662, font: 'F1', size: 10 },
            { text: 'Pay Period:', x: 52, y: 640, font: 'F2', size: 10 },
            { text: periodIso, x: 210, y: 640, font: 'F3', size: 10 },
            { text: 'Payment Date:', x: 52, y: 618, font: 'F2', size: 10 },
            { text: payDate, x: 210, y: 618, font: 'F3', size: 10 },
            { text: 'Gross Pay:', x: 52, y: 586, font: 'F2', size: 10 },
            { text: 'INR 74,000.00', x: 210, y: 586, font: 'F3', size: 10 },
            { text: 'Total Deductions:', x: 52, y: 540, font: 'F2', size: 10 },
            { text: 'INR 15,000.00', x: 210, y: 540, font: 'F3', size: 10 },
            { text: 'Net Pay:', x: 52, y: 512, font: 'F2', size: 10 },
            { text: 'INR 59,000.00', x: 210, y: 512, font: 'F3', size: 10 },
          ],
        },
      ],
    });

  const kulkarniBankPartial = buildPdfDocument({
    producer: 'Axis Bank Statement Engine 5.0',
    title: 'Axis Bank Statement October 2026 Partial - Rohan Kulkarni',
    pages: [
      {
        rects: [{ x: 40, y: 575, w: 532, h: 32, r: 0.94, g: 0.96, b: 0.99 }],
        lines: [
          { x1: 40, y1: 715, x2: 572, y2: 715 },
          { x1: 40, y1: 575, x2: 572, y2: 575 },
          { x1: 40, y1: 506, x2: 572, y2: 506 },
        ],
        commands: [
          { text: 'FICTIONAL BANK ACCOUNT STATEMENT (INDIAN RUPEE TEST PACKET)', x: 48, y: 752, font: 'F2', size: 9 },
          { text: 'Axis Bank Priority Statement — Page 1 of 2 (Incomplete Submission)', x: 40, y: 724, font: 'F2', size: 13.5 },
          { text: 'Account Holder:', x: 44, y: 690, font: 'F2', size: 10 },
          { text: 'Rohan Kulkarni', x: 165, y: 690, font: 'F1', size: 10 },
          { text: 'Account Number:', x: 335, y: 690, font: 'F2', size: 10 },
          { text: 'UTIB-002094118', x: 438, y: 690, font: 'F3', size: 10 },
          { text: 'Statement Period:', x: 44, y: 668, font: 'F2', size: 10 },
          { text: '2026-10-01 to 2026-10-18', x: 165, y: 668, font: 'F3', size: 10 },
          { text: 'Opening Balance:', x: 44, y: 644, font: 'F2', size: 10 },
          { text: 'INR 64,000.00', x: 165, y: 644, font: 'F3', size: 10 },
          { text: 'Closing Balance:', x: 335, y: 644, font: 'F2', size: 10 },
          { text: 'INR 42,500.00', x: 438, y: 644, font: 'F3', size: 10 },
          // Table headers
          { text: 'Date', x: 44, y: 586, font: 'F2', size: 9 },
          { text: 'Narration', x: 108, y: 586, font: 'F2', size: 9 },
          { text: 'Debit', x: 332, y: 586, font: 'F2', size: 9 },
          { text: 'Credit', x: 414, y: 586, font: 'F2', size: 9 },
          { text: 'Balance', x: 494, y: 586, font: 'F2', size: 9 },
          // Rows
          { text: '2026-10-04', x: 44, y: 554, font: 'F3', size: 8.5 },
          { text: 'NEFT Kothrud Co-op Housing Society Rent', x: 108, y: 554, font: 'F1', size: 8.5 },
          { text: 'INR 18,000.00', x: 332, y: 554, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 554, font: 'F3', size: 8.5 },
          { text: 'INR 46,000.00', x: 494, y: 554, font: 'F3', size: 8.5 },

          { text: '2026-10-14', x: 44, y: 530, font: 'F3', size: 8.5 },
          { text: 'UPI MahaVitaran Electricity & Pune Metro', x: 108, y: 530, font: 'F1', size: 8.5 },
          { text: 'INR 3,500.00', x: 332, y: 530, font: 'F3', size: 8.5 },
          { text: '-', x: 414, y: 530, font: 'F3', size: 8.5 },
          { text: 'INR 42,500.00', x: 494, y: 530, font: 'F3', size: 8.5 },
        ],
      },
    ],
  });

  return [
    {
      caseId: 'case-sharma-consistent',
      title: 'Consistent Loan Packet — Aarav Sharma',
      applicantName: 'Aarav Sharma',
      referenceCode: 'APP-IND-2026-014',
      scenarioTag: 'consistent',
      summary:
        'Clean Indian Rupee baseline packet: loan application, two monthly Infosys FinTech salary slips (₹85,000 gross / ₹66,300 net), and Q3 SBI bank statement align across applicant, basis, EPF/TDS deductions, and NEFT salary credits.',
      documents: [
        { displayName: 'Loan_Application_Sharma.pdf', buffer: sharmaApp },
        { displayName: 'Salary_Slip_Aug2026_Sharma.pdf', buffer: makeSharmaSlip('August 2026', '2026-08', '2026-08-31') },
        { displayName: 'Salary_Slip_Sep2026_Sharma.pdf', buffer: makeSharmaSlip('September 2026', '2026-09', '2026-09-30') },
        { displayName: 'SBI_Bank_Statement_Q3_2026_Sharma.pdf', buffer: sharmaBank },
      ],
    },
    {
      caseId: 'case-deshmukh-discrepancy',
      title: 'Altered Salary & Native/Rendered Disagreement — Vikram Deshmukh',
      applicantName: 'Vikram Deshmukh',
      referenceCode: 'APP-IND-2026-019',
      scenarioTag: 'discrepancy-visual',
      summary:
        'August salary slip renders ₹1,12,000.00 in shifted bold typography while retaining ₹68,000.00 in the underlying PDF text stream and matching a ₹68,000.00 HDFC Bank NEFT salary credit.',
      documents: [
        { displayName: 'Loan_Application_Deshmukh.pdf', buffer: deshmukhApp },
        { displayName: 'Salary_Slip_Aug2026_Deshmukh.pdf', buffer: deshmukhSlip },
        { displayName: 'HDFC_Bank_Statement_Aug2026_Deshmukh.pdf', buffer: deshmukhBank },
      ],
    },
    {
      caseId: 'case-nair-split-payment',
      title: 'Legitimate Split Payment & Gross/Net Alignment — Priya Nair',
      applicantName: 'Priya Nair',
      referenceCode: 'APP-IND-2026-023',
      scenarioTag: 'split-payment',
      summary:
        'Annual gross income (₹9,00,000.00 LPA) aligns with ₹75,000.00 monthly gross / ₹60,000.00 net pay settled via two split ICICI Bank NEFT credits (₹36,000.00 + ₹24,000.00) on a searchable scan.',
      documents: [
        { displayName: 'Loan_Application_Nair.pdf', buffer: nairApp },
        { displayName: 'Salary_Slip_Sep2026_Nair.pdf', buffer: nairSlip },
        { displayName: 'ICICI_Bank_Statement_Sep2026_Nair.pdf', buffer: nairBank },
      ],
    },
    {
      caseId: 'case-kulkarni-incomplete-provenance',
      title: 'Incomplete Statement Coverage & Shared Provenance — Rohan Kulkarni',
      applicantName: 'Rohan Kulkarni',
      referenceCode: 'APP-IND-2026-031',
      scenarioTag: 'incomplete-coverage',
      summary:
        'Partial October Axis Bank statement (Page 1 of 2, Oct 1–18 only) leaves month-end ₹59,000.00 payroll unverified via scoped negative search; two KekaHR payslips share identical builder lineage.',
      documents: [
        { displayName: 'Loan_Application_Kulkarni.pdf', buffer: kulkarniApp },
        { displayName: 'Salary_Slip_Sep2026_Kulkarni.pdf', buffer: makeKulkarniSlip('2026-09', '2026-09-30') },
        { displayName: 'Salary_Slip_Oct2026_Kulkarni.pdf', buffer: makeKulkarniSlip('2026-10', '2026-10-31') },
        { displayName: 'Axis_Bank_Statement_Oct2026_Partial_Kulkarni.pdf', buffer: kulkarniBankPartial },
      ],
    },
  ];
}
