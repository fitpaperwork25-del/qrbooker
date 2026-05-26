import QRCode from "qrcode";
import { IDocument, IsExtensionInstalled } from "./bpac.js";

const APP_URL = "https://qrbooker.app";
const TEMPLATE_PATH = "C:\\qrbooker-print-server\\qrbooker-template.lbx";

function getBusinessName(table, businessSlug) {
  return (
    table?.business_name ||
    table?.restaurant_name ||
    table?.businessName ||
    table?.business?.name ||
    businessSlug
  );
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

function getTableValue(table, index) {
  return (
    table?.slug ||
    table?.table_slug ||
    table?.id ||
    table?.table_number ||
    table?.tableNumber ||
    index + 1
  );
}

function getQrUrl(businessSlug, table, index) {
  const tableValue = getTableValue(table, index);

  return `${APP_URL}/scan/${businessSlug}?table=${encodeURIComponent(
    tableValue
  )}`;
}

export async function printBrotherLabels({ businessSlug, tables }) {
  if (!IsExtensionInstalled()) {
    alert(
      "Brother b-PAC extension is not detected.\n\n" +
        "1. Open this page in Microsoft Edge.\n" +
        "2. Make sure the Brother b-PAC Extension is installed and enabled.\n" +
        "3. Hard refresh with Ctrl + Shift + R."
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

  const opened = await IDocument.Open(TEMPLATE_PATH);

  if (!opened) {
    alert(
      `Could not open Brother label template:\n${TEMPLATE_PATH}\n\nMake sure the .lbx file exists at that path.`
    );
    return;
  }

  try {
    await IDocument.StartPrint("QRBooker Labels", 0);

    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];

      const businessName = getBusinessName(table, businessSlug);
      const tableName = getTableName(table, i);
      const qrUrl = getQrUrl(businessSlug, table, i);

      console.log("QR label debug:", {
        businessSlug,
        businessName,
        table,
        tableName,
        qrUrl,
      });

      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        margin: 1,
        width: 500,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      const businessObj = await IDocument.GetObject("businessName");
      const tableObj = await IDocument.GetObject("tableName");
      const qrObj = await IDocument.GetObject("qrCode");

      if (!businessObj) {
        throw new Error("Template object 'businessName' not found in .lbx file");
      }

      if (!tableObj) {
        throw new Error("Template object 'tableName' not found in .lbx file");
      }

      if (!qrObj) {
        throw new Error("Template object 'qrCode' not found in .lbx file");
      }

      businessObj.Text = businessName;
      tableObj.Text = tableName;

      await qrObj.SetData(0, qrDataUrl, 4);

      await IDocument.PrintOut(1, 0);
    }

    await IDocument.EndPrint();
    await IDocument.Close();

    alert(`${tables.length} label(s) sent to Brother printer.`);
  } catch (error) {
    console.error("Brother print error:", error);

    try {
      await IDocument.Close();
    } catch (_) {}

    alert(`Brother print failed:\n${error.message || error}`);
  }
}