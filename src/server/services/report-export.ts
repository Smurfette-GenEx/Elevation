import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { analytics } from "./dashboard-service";

type Data = Awaited<ReturnType<typeof analytics>>;

const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sections(data: Data): { title: string; headers: string[]; rows: (string | number)[][] }[] {
  const amt = `Amount (${data.currency})`;
  return [
    { title: "Key indicators", headers: ["Indicator", "Value"], rows: [
      ["Total expenses", data.totals.amount], ["Expense reports", data.totals.reports], ["Expense lines", data.totals.lines],
      ["Policy compliance rate (%)", data.totals.complianceRate], ["Avg. reimbursement cycle (days)", data.totals.avgCycleDays ?? "n/a"],
      ["Outstanding employee liabilities", data.totals.outstandingLiabilities], ["Reports pending review", data.totals.pendingReview],
    ] },
    { title: "By legal entity", headers: ["Entity", amt, "Lines"], rows: data.byEntity.map((r) => [r.label, r.amount, r.count]) },
    { title: "By country", headers: ["Country", amt, "Lines"], rows: data.byCountry.map((r) => [r.label, r.amount, r.count]) },
    { title: "By category", headers: ["Category", amt, "Lines"], rows: data.byCategory.map((r) => [r.label, r.amount, r.count]) },
    { title: "By department", headers: ["Department", amt, "Lines"], rows: data.byDepartment.map((r) => [r.label, r.amount, r.count]) },
    { title: "By cost center", headers: ["Cost center", amt, "Lines"], rows: data.byCostCenter.map((r) => [r.label, r.amount, r.count]) },
    { title: "By transaction currency", headers: ["Currency", "Original amount", amt, "Lines"], rows: data.byCurrency.map((r) => [r.currency, r.original, r.reporting, r.count]) },
    { title: "Monthly trend", headers: ["Month", "Pending", "Approved", "Paid"], rows: data.trend.map((r) => [r.month, r.pending, r.approved, r.paid]) },
  ];
}

export async function dashboardToXlsx(data: Data) {
  const wb = new ExcelJS.Workbook();
  const meta = wb.addWorksheet("Filters");
  meta.addRows(Object.entries(data.filters).map(([k, v]) => [k, v ?? "all"]));
  for (const s of sections(data)) {
    const ws = wb.addWorksheet(s.title.slice(0, 31));
    ws.addRow(s.headers).font = { bold: true };
    s.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => { c.width = i === 0 ? 36 : 18; c.numFmt = i === 0 ? "@" : "#,##0.00"; });
  }
  return { fileName: `expense-analytics_${data.filters.from}_${data.filters.to}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: Buffer.from(await wb.xlsx.writeBuffer()) };
}

export async function dashboardToPdf(data: Data, generatedBy: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 40;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, "?"); // standard fonts are WinAnsi only
  const text = (s: string, x: number, size: number, f: PDFFont = font, color = rgb(0.1, 0.12, 0.16)) => page.drawText(ascii(s), { x, y, size, font: f, color });
  const ensure = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M; } };

  text("Expense analytics", M, 18, bold); y -= 20;
  text(`Period ${data.filters.from} to ${data.filters.to} | Reporting currency ${data.currency} | Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by ${generatedBy}`, M, 8, font, rgb(0.4, 0.4, 0.45)); y -= 22;

  for (const s of sections(data)) {
    ensure(40);
    text(s.title, M, 12, bold); y -= 16;
    const colW = (W - 2 * M) / s.headers.length;
    s.headers.forEach((h, i) => text(h, M + i * colW, 8, bold)); y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) }); y -= 11;
    for (const row of s.rows.slice(0, 25)) {
      ensure(12);
      row.forEach((c, i) => text(typeof c === "number" ? fmt(c) : String(c).slice(0, 48), M + i * colW, 8)); y -= 11;
    }
    y -= 12;
  }
  return { fileName: `expense-analytics_${data.filters.from}_${data.filters.to}.pdf`, contentType: "application/pdf", body: Buffer.from(await pdf.save()) };
}
