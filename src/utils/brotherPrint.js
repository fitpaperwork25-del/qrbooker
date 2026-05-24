import QRCode from "qrcode";

const APP_URL = "https://www.qrwegn.com";
const TEMPLATE_PATH = "C:\\qrwegn-print-server\\qrwegn-template.lbx";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBpac() {
  for (let i = 0; i < 50; i++) {
    if (window.bpac) return window.bpac;
    await sleep(100);
  }
  return null;
}

function getTableName(table, index) {
  return (
    table?.table_name ||
    table?.name ||
    table?.label ||
    table?.tableNumber ||
    table?.table_number ||
    `Table ${index + 1}`
  );
}

function getQrUrl(businessSlug, table, index) {
  const tableValue =
    table?.slug ||
    table?.table_slug ||
    table?.id ||
    table?.table_number ||
    table?.tableNumber ||
    index + 1;
  return `${APP_URL}/scan/${businessSlug}?table=${tableValue}`;
}

export async function printBrotherLabels({ businessSlug, tables }) {
  console.log("bpac debug:", {
    windowBpac: window.bpac,
    bodyClass: document.body.className,
    userAgent: navigator.userAgent,
    businessSlug,
    tables,
  });

  const bpac = await waitForBpac();
  if (!bpac) {
    alert(
      "Brother b-PAC extension is detected, but the b-PAC API is not exposed to this page. Open this in Microsoft Edge, hard refresh, then check Console."
    );
    return;
  }

  if (!businessSlug) {
    alert("Missing business slug.");
    return;
  }

  if (!tables || tables.length === 0) {
    alert("No tables found to print.");
    return;
  }

  let doc;
  try {
    doc = bpac.IDocument || new bpac.Document();
    const opened = await doc.Open(TEMPLATE_PATH);
    if (!opened) {
      alert(`Could not open Brother template:\n${TEMPLATE_PATH}`);
      return;
    }

    await doc.StartPrint("QR-Wegn Labels", 0);

    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const tableName = getTableName(table, i);
      const qrUrl = getQrUrl(businessSlug, table, i);

      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        margin: 1,
        width: 500,
        color: { dark: "#000000", light: "#FFFFFF" },
      });

      const tableObj = await doc.GetObject("tableName");
      const qrObj = await doc.GetObject("qrCode");

      if (!tableObj) throw new Error("Template object not found: tableName");
      if (!qrObj) throw new Error("Template object not found: qrCode");

      tableObj.Text = tableName;

      if (typeof qrObj.SetData === "function") {
        await qrObj.SetData(0, qrDataUrl, 4);
      } else if ("Source" in qrObj) {
        qrObj.Source = qrDataUrl;
      } else {
        throw new Error("QR object found, but no supported image setter.");
      }

      await doc.PrintOut(1, 1);
    }

    await doc.EndPrint();
    await doc.Close();
    alert(`${tables.length} label(s) sent to Brother printer.`);
  } catch (error) {
    console.error("Brother print error:", error);
    try { if (doc) await doc.Close(); } catch (_) {}
    alert(`Brother print failed:\n${error.message || error}`);
  }
}