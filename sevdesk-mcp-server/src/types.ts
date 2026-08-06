export interface SevdeskContact {
  id: string;
  objectName: "Contact";
  name?: string;
  surename?: string;
  familyname?: string;
  category?: { id: string; objectName: "Category" };
  create?: string;
  update?: string;
}

export interface SevdeskOrder {
  id: string;
  objectName: "Order";
  orderNumber?: string;
  contact?: { id: string; objectName: "Contact" };
  contactPerson?: { id: string; objectName: "SevUser" };
  orderDate?: string;
  status?: number;
  header?: string;
  headText?: string | null;
  footText?: string | null;
  orderType?: "AN" | "AB" | "LI";
  sumNet?: string;
  sumGross?: string;
  sumTax?: string;
  create?: string;
  update?: string;
}

export interface SevdeskInvoice {
  id: string;
  objectName: "Invoice";
  invoiceNumber?: string;
  contact?: { id: string; objectName: "Contact" };
  contactPerson?: { id: string; objectName: "SevUser" };
  invoiceDate?: string;
  status?: number;
  header?: string;
  headText?: string | null;
  footText?: string | null;
  invoiceType?: "RE" | "WKR" | "SR" | "AR" | "TR";
  sumNet?: string;
  sumGross?: string;
  sumTax?: string;
  payDate?: string | null;
  create?: string;
  update?: string;
}

export interface SevdeskCheckAccount {
  id: string;
  objectName: "CheckAccount";
  name?: string;
  balance?: number | string;
  status?: number;
  defaultAccount?: number;
}

export interface SevdeskCheckAccountTransaction {
  id: string;
  objectName: "CheckAccountTransaction";
  valueDate?: string;
  entryDate?: string;
  amount?: string | number;
  paymtPurpose?: string;
  payeePayerName?: string;
  status?: number;
}

/** Eine Rechnungs-/Angebotsposition, wie sie ein Nutzer/Agent typischerweise angibt. */
export interface PositionInput {
  name: string;
  quantity: number;
  price: number;
  unity?: number;
  taxRate?: number;
  text?: string;
}
