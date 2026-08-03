/**
 * Cashflow PDF report — ports web jsPDF + autoTable export for React Native.
 */

import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMoney } from "@/lib/format";
import { saveExportFile, type ExportSaveMethod } from "@/lib/export";

export type CashflowPdfRow = {
  id: string;
  kind: string;
  label: string;
  value: number;
  date?: string;
  amountText?: string;
};

export type CashflowPdfChartPoint = {
  label: string;
  balance: number;
};

export type CashflowPdfInput = {
  periodLabel: string;
  currency: string;
  kindFilter?: string;
  categoryFilter?: string;
  totals: { income: number; expense: number; net: number };
  rows: CashflowPdfRow[];
  chartData?: CashflowPdfChartPoint[];
  filenameStem?: string;
  labels: {
    reportTitle: string;
    period: string;
    filters: string;
    income: string;
    expenses: string;
    net: string;
    date: string;
    type: string;
    sourceCategory: string;
    amount: string;
    inCurrency: string;
    balancePositive: string;
    balanceNegative: string;
  };
};

export async function exportCashflowPdf(input: CashflowPdfInput): Promise<ExportSaveMethod> {
  if (!input.rows.length) {
    throw new Error("No entries in range");
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const { labels, currency, totals } = input;

  doc.setFontSize(18);
  doc.text(labels.reportTitle, margin, 50);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${labels.period}: ${input.periodLabel}`, margin, 68);
  doc.text(labels.filters, margin, 82);

  doc.setTextColor(0);
  doc.setFontSize(11);
  const sumY = 110;
  doc.text(`${labels.income}: ${formatMoney(totals.income, currency)}`, margin, sumY);
  doc.text(`${labels.expenses}: ${formatMoney(totals.expense, currency)}`, margin + 180, sumY);
  doc.text(
    `${labels.net}: ${totals.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(totals.net), currency)}`,
    margin + 360,
    sumY,
  );

  const chartTop = 135;
  const chartH = 200;
  const chartW = pageW - margin * 2;
  const chartLeft = margin;
  const chartBottom = chartTop + chartH;

  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(chartLeft, chartBottom, chartLeft + chartW, chartBottom);
  doc.line(chartLeft, chartTop, chartLeft, chartBottom);

  const chartData = input.chartData ?? [];
  if (chartData.length > 0) {
    const minBal = Math.min(0, ...chartData.map((d) => d.balance));
    const maxBal = Math.max(0, ...chartData.map((d) => d.balance));
    const range = Math.max(1, maxBal - minBal);
    const xStep = chartData.length > 1 ? chartW / (chartData.length - 1) : 0;
    const yFor = (v: number) => chartBottom - ((v - minBal) / range) * (chartH - 10);

    doc.setFontSize(8);
    doc.setTextColor(140);
    for (let i = 0; i <= 4; i++) {
      const v = minBal + (range / 4) * i;
      const y = yFor(v);
      doc.setDrawColor(235);
      doc.line(chartLeft, y, chartLeft + chartW, y);
      doc.text(formatMoney(v, currency, { compact: true }), chartLeft - 4, y + 3, {
        align: "right",
      });
    }

    const GREEN: [number, number, number] = [34, 197, 94];
    const RED: [number, number, number] = [239, 68, 68];
    doc.setLineWidth(1.4);
    for (let i = 0; i < chartData.length - 1; i++) {
      const x1 = chartLeft + i * xStep;
      const x2 = chartLeft + (i + 1) * xStep;
      const v1 = chartData[i]!.balance;
      const v2 = chartData[i + 1]!.balance;
      const y1 = yFor(v1);
      const y2 = yFor(v2);
      if ((v1 >= 0 && v2 >= 0) || (v1 < 0 && v2 < 0)) {
        const c = v1 >= 0 ? GREEN : RED;
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.line(x1, y1, x2, y2);
      } else {
        const tZero = Math.abs(v1) / (Math.abs(v1) + Math.abs(v2));
        const xm = x1 + (x2 - x1) * tZero;
        const ym = yFor(0);
        const c1 = v1 >= 0 ? GREEN : RED;
        const c2 = v2 >= 0 ? GREEN : RED;
        doc.setDrawColor(c1[0], c1[1], c1[2]);
        doc.line(x1, y1, xm, ym);
        doc.setDrawColor(c2[0], c2[1], c2[2]);
        doc.line(xm, ym, x2, y2);
      }
    }

    const step = Math.max(1, Math.ceil(chartData.length / 6));
    doc.setTextColor(140);
    for (let i = 0; i < chartData.length; i += step) {
      const x = chartLeft + i * xStep;
      doc.text(chartData[i]!.label, x, chartBottom + 12, { align: "center" });
    }

    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(chartLeft, chartTop - 14, 8, 8, "F");
    doc.setTextColor(80);
    doc.text(labels.balancePositive, chartLeft + 12, chartTop - 8);
    doc.setFillColor(RED[0], RED[1], RED[2]);
    doc.rect(chartLeft + 90, chartTop - 14, 8, 8, "F");
    doc.text(labels.balanceNegative, chartLeft + 102, chartTop - 8);
  }

  const tableRows = [...input.rows]
    .sort((a, b) => +(a.date ? new Date(a.date) : 0) - +(b.date ? new Date(b.date) : 0))
    .map((r) => [
      r.date ?? "",
      r.kind,
      r.label,
      r.amountText ?? formatMoney(r.value, currency),
      formatMoney(r.value, currency),
    ]);

  autoTable(doc, {
    startY: chartBottom + 40,
    head: [[labels.date, labels.type, labels.sourceCategory, labels.amount, labels.inCurrency]],
    body: tableRows,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const type = String((data.row.raw as unknown as unknown[])?.[1] ?? "");
      if (type === "income") {
        data.cell.styles.textColor = [22, 163, 74];
      } else if (type === "expense") {
        data.cell.styles.textColor = [220, 38, 38];
      }
    },
    margin: { left: margin, right: margin },
  });

  const stem = input.filenameStem ?? "cashflow";
  const fname = `${stem}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`;
  const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
  return saveExportFile(fname, { bytes: pdfBytes });
}
