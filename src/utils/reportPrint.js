import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

// Currency formatter shared by every finance report screen.
export const fmtCurrency = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

// A titled table of label/value rows, with an optional bold total row.
// lines: [{ label, amount }]
export const sectionTableHtml = (title, lines, totalLabel, totalAmount) => {
  const rowsHtml = (lines || [])
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.label)}</td><td class="amount">${escapeHtml(fmtCurrency(line.amount))}</td></tr>`
    )
    .join("");
  const totalHtml =
    totalLabel !== undefined
      ? `<tr class="total"><td>${escapeHtml(totalLabel)}</td><td class="amount">${escapeHtml(fmtCurrency(totalAmount))}</td></tr>`
      : "";
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      <table>${rowsHtml || `<tr><td colspan="2" class="empty">No data</td></tr>`}${totalHtml}</table>
    </div>
  `;
};

// A generic multi-column table.
// headers: [string], rows: [[cell, cell, ...]], rightAlignFrom: index from which columns are right-aligned
export const tableHtml = (headers, rows, rightAlignFrom = 1) => {
  const headHtml = headers
    .map((h, i) => `<th class="${i >= rightAlignFrom ? "amount" : ""}">${escapeHtml(h)}</th>`)
    .join("");
  const bodyHtml = (rows || [])
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => `<td class="${i >= rightAlignFrom ? "amount" : ""}">${escapeHtml(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `
    <table>
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${bodyHtml || `<tr><td colspan="${headers.length}" class="empty">No data</td></tr>`}</tbody>
    </table>
  `;
};

// A highlighted box for final totals. pairs: [{ label, value }]
export const finalBoxHtml = (pairs) => `
  <div class="final-box">
    ${pairs
      .map(
        (p) =>
          `<div class="final-row"><span>${escapeHtml(p.label)}</span><span>${escapeHtml(p.value)}</span></div>`
      )
      .join("")}
  </div>
`;

const buildDocumentHtml = ({ title, subtitle, bodyHtml }) => {
  const generatedAt = new Date().toLocaleString("en-IN");
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: Helvetica, Arial, sans-serif; color: #222; padding: 28px; }
          h1 { font-size: 20px; margin: 0 0 2px; }
          .subtitle { font-size: 12px; color: #666; margin-bottom: 4px; }
          .generated { font-size: 10px; color: #999; margin-bottom: 22px; }
          .section { margin-bottom: 18px; }
          .section-title { font-size: 13px; font-weight: bold; color: #666; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
          th, td { padding: 6px 8px; font-size: 12px; text-align: left; border-bottom: 1px solid #eee; }
          thead th { border-bottom: 2px solid #ccc; color: #555; }
          td.amount, th.amount { text-align: right; }
          tr.total td { font-weight: bold; border-top: 1px solid #999; border-bottom: none; }
          td.empty { text-align: center; color: #999; padding: 14px; }
          .final-box { border: 1px solid #0A8F8F; border-radius: 8px; padding: 10px 14px; margin-top: 8px; }
          .final-row { display: flex; justify-content: space-between; font-weight: bold; color: #0A8F8F; font-size: 13px; margin-bottom: 4px; }
          .final-row:last-child { margin-bottom: 0; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
        <div class="generated">Generated on ${escapeHtml(generatedAt)}</div>
        ${bodyHtml}
      </body>
    </html>
  `;
};

// Opens the native print dialog for the given report. Falls back to
// generating a PDF and opening the share sheet if direct printing fails
// or isn't supported on the current platform.
export const printReport = async ({ title, subtitle, bodyHtml }) => {
  const html = buildDocumentHtml({ title, subtitle, bodyHtml });
  try {
    await Print.printAsync({ html });
  } catch (err) {
    console.log("Print error, falling back to share:", err);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("Print unavailable", "Printing and sharing aren't supported on this device.");
      }
    } catch (err2) {
      console.log("Print fallback error:", err2);
      Alert.alert("Print failed", "Something went wrong while preparing the report.");
    }
  }
};