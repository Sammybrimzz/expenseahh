import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const DEFAULT_CATEGORIES = ["Food", "Travelling", "College Lunch", "Stationery", "Other"];
export const CATEGORY_TONES = ["brand", "clay", "sage", "olive", "sand"] as const;
export type PaymentMethod = "cash" | "upi";
export type TransactionType = "expense" | "cash_added" | "transfer";

export type Transaction = {
  id: string;
  date: string;
  amount: number;
  category: string;
  paymentMethod?: PaymentMethod;
  note: string;
  type: TransactionType;
  createdAt: string;
};

export type RecurringTemplate = {
  id: string;
  name: string;
  amount: number;
  category: string;
  paymentMethod: PaymentMethod;
  note: string;
};

export type Ledger = {
  id: string;
  month: string;
  startingCash: number;
  startingBank?: number;
  monthlyBudget?: number;
  categoryBudgets: Record<string, number>;
  categories: string[];
  transactions: Transaction[];
  recurringTemplates: RecurringTemplate[];
};

export type LedgerStore = { activeMonthId: string; ledgers: Ledger[] };

const STORAGE_KEY = "hatch-pocket-ledger-v1";

export const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export const formatShortINR = (value: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)}`;

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

export const dateLabel = (date: string, format: "long" | "short" = "long") =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: format === "long" ? "long" : "short", year: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );

export const getTodayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const monthFromDate = (date: string) => date.slice(0, 7);

export function emptyLedger(month: string, startingCash: number, monthlyBudget?: number, startingBank?: number): Ledger {
  return {
    id: crypto.randomUUID(),
    month,
    startingCash,
    ...(startingBank === undefined ? {} : { startingBank }),
    ...(monthlyBudget === undefined ? {} : { monthlyBudget }),
    categoryBudgets: {},
    categories: [...DEFAULT_CATEGORIES],
    transactions: [],
    recurringTemplates: [],
  };
}

function loadStore(): LedgerStore | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LedgerStore) : null;
  } catch {
    return null;
  }
}

function transactionTotal(ledger: Ledger, type: TransactionType, paymentMethod?: PaymentMethod) {
  return ledger.transactions
    .filter((transaction) => transaction.type === type && (!paymentMethod || transaction.paymentMethod === paymentMethod))
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function getSummary(ledger: Ledger) {
  const expenses = ledger.transactions.filter((transaction) => transaction.type === "expense");
  const totalSpent = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const cashSpent = transactionTotal(ledger, "expense", "cash");
  const upiSpent = transactionTotal(ledger, "expense", "upi");
  const cashAdded = transactionTotal(ledger, "cash_added");
  const transfers = transactionTotal(ledger, "transfer");
  const cashRemaining = ledger.startingCash + cashAdded + transfers - cashSpent;
  const monthStart = new Date(`${ledger.month}-01T12:00:00`);
  const today = new Date();
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const elapsed = ledger.month === getTodayISO().slice(0, 7)
    ? Math.min(today.getDate(), monthEnd.getDate())
    : monthEnd.getDate();
  const dailyAverage = elapsed ? totalSpent / elapsed : 0;
  const projected = dailyAverage * monthEnd.getDate();
  const categories = ledger.categories.map((category, index) => {
    const amount = expenses.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0);
    return { category, amount, percentage: totalSpent ? (amount / totalSpent) * 100 : 0, tone: CATEGORY_TONES[index % CATEGORY_TONES.length] };
  }).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const daily = expenses.reduce<Record<string, number>>((acc, item) => {
    acc[item.date] = (acc[item.date] || 0) + item.amount;
    return acc;
  }, {});
  const highestDay = Object.entries(daily).sort((a, b) => b[1] - a[1])[0];
  const highestCategory = categories[0];
  return {
    expenses,
    totalSpent,
    cashSpent,
    upiSpent,
    cashAdded,
    transfers,
    cashRemaining,
    elapsed,
    dailyAverage,
    projected,
    categories,
    daily,
    highestDay,
    highestCategory,
    budgetPercent: ledger.monthlyBudget ? (totalSpent / ledger.monthlyBudget) * 100 : 0,
  };
}

type LedgerContextValue = {
  store: LedgerStore | null;
  activeLedger: Ledger | null;
  isReady: boolean;
  setActiveMonth: (id: string) => void;
  createMonth: (month: string, startingCash: number, budget?: number, startingBank?: number) => void;
  saveTransaction: (transaction: Omit<Transaction, "id" | "createdAt">, id?: string) => void;
  deleteTransaction: (id: string) => void;
  addCategory: (category: string) => void;
  updateSettings: (updates: Partial<Pick<Ledger, "startingCash" | "startingBank" | "monthlyBudget" | "categoryBudgets">>) => void;
  addRecurringTemplate: (template: Omit<RecurringTemplate, "id">) => void;
  generateRecurring: (templateId: string) => void;
  replaceStore: (nextStore: LedgerStore) => void;
  clearAllData: () => void;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<LedgerStore | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setStore(loadStore());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady && store) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [isReady, store]);

  const activeLedger = useMemo(() => store?.ledgers.find((ledger) => ledger.id === store.activeMonthId) || store?.ledgers[0] || null, [store]);

  const updateActive = (updater: (ledger: Ledger) => Ledger) => {
    setStore((current) => {
      if (!current) return current;
      return { ...current, ledgers: current.ledgers.map((ledger) => ledger.id === current.activeMonthId ? updater(ledger) : ledger) };
    });
  };

  const value: LedgerContextValue = {
    store,
    activeLedger,
    isReady,
    setActiveMonth: (id) => setStore((current) => current ? { ...current, activeMonthId: id } : current),
    createMonth: (month, startingCash, budget, startingBank) => {
      setStore((current) => {
        const existing = current?.ledgers.find((ledger) => ledger.month === month);
        if (existing) return { ...current!, activeMonthId: existing.id };
        const ledger = emptyLedger(month, startingCash, budget, startingBank);
        return { activeMonthId: ledger.id, ledgers: [...(current?.ledgers || []), ledger] };
      });
    },
    saveTransaction: (transaction, id) => updateActive((ledger) => ({ ...ledger, transactions: id ? ledger.transactions.map((item) => item.id === id ? { ...item, ...transaction } : item) : [{ ...transaction, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...ledger.transactions] })),
    deleteTransaction: (id) => updateActive((ledger) => ({ ...ledger, transactions: ledger.transactions.filter((item) => item.id !== id) })),
    addCategory: (category) => updateActive((ledger) => ledger.categories.some((item) => item.toLowerCase() === category.toLowerCase()) ? ledger : { ...ledger, categories: [...ledger.categories, category] }),
    updateSettings: (updates) => updateActive((ledger) => ({ ...ledger, ...updates })),
    addRecurringTemplate: (template) => updateActive((ledger) => ({ ...ledger, recurringTemplates: [...ledger.recurringTemplates, { ...template, id: crypto.randomUUID() }] })),
    generateRecurring: (templateId) => updateActive((ledger) => {
      const template = ledger.recurringTemplates.find((item) => item.id === templateId);
      if (!template) return ledger;
      return { ...ledger, transactions: [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), date: getTodayISO(), amount: template.amount, category: template.category, paymentMethod: template.paymentMethod, note: `${template.note || template.name} · generated`, type: "expense" }, ...ledger.transactions] };
    }),
    replaceStore: (nextStore) => setStore(nextStore),
    clearAllData: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      setStore(null);
    },
  };

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const context = useContext(LedgerContext);
  if (!context) throw new Error("useLedger must be used inside LedgerProvider");
  return context;
}

export function exportLedgerJSON(store: LedgerStore) {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  downloadBlob(blob, "hatch-ledger-backup.json");
}

export function exportLedgerCSV(ledger: Ledger) {
  const summary = getSummary(ledger);
  const expenses = summary.expenses.slice().sort((a, b) => a.date.localeCompare(b.date));
  const categoryRows = summary.categories.map((item) => [item.category, formatINR(item.amount)]);
  const rows = [
    ["Date", "Expense description", "Category", "Amount", "Payment method", "Notes"],
    ...expenses.map((item) => [
      item.date,
      item.note || item.category,
      item.category,
      formatINR(item.amount),
      item.paymentMethod === "cash" ? "Cash" : item.paymentMethod === "upi" ? "UPI / Bank" : "Not specified",
      item.note,
    ]),
    [],
    ["MONTHLY TOTALS"],
    ["Total monthly expenses", formatINR(summary.totalSpent)],
    ["Total cash expenses", formatINR(summary.cashSpent)],
    ["Total digital / bank expenses", formatINR(summary.upiSpent)],
    [],
    ["CATEGORY-WISE TOTALS"],
    ...categoryRows,
  ];
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${ledger.month}-ledger.csv`);
}

export async function exportLedgerPDF(ledger: Ledger) {
  const { jsPDF } = await import("jspdf");
  const summary = getSummary(ledger);
  const expenses = summary.expenses.slice().sort((a, b) => a.date.localeCompare(b.date));
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  let y = 18;
  const money = (value: number) => `INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)}`;
  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };
  const drawLine = () => {
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageWidth - margin, y);
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(`${monthLabel(ledger.month)} Expense Report`, margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("Monthly expense summary", margin, y);
  y += 8;
  drawLine();
  y += 8;

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Date", margin, y);
  doc.text("Description", margin + 25, y);
  doc.text("Category", margin + 91, y);
  doc.text("Payment", margin + 128, y);
  doc.text("Amount", pageWidth - margin, y, { align: "right" });
  y += 5;
  drawLine();
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  expenses.forEach((item) => {
    ensureSpace(9);
    const description = (item.note || item.category).slice(0, 30);
    const payment = item.paymentMethod === "cash" ? "Cash" : item.paymentMethod === "upi" ? "UPI / Bank" : "—";
    doc.text(dateLabel(item.date, "short"), margin, y);
    doc.text(description, margin + 25, y);
    doc.text(item.category.slice(0, 18), margin + 91, y);
    doc.text(payment, margin + 128, y);
    doc.text(money(item.amount), pageWidth - margin, y, { align: "right" });
    y += 6;
  });

  ensureSpace(50);
  y += 4;
  drawLine();
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Monthly totals", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  [
    ["Total monthly expenses", summary.totalSpent],
    ["Total cash expenses", summary.cashSpent],
    ["Total digital / bank expenses", summary.upiSpent],
  ].forEach(([label, value]) => {
    doc.text(String(label), margin, y);
    doc.text(money(Number(value)), pageWidth - margin, y, { align: "right" });
    y += 6;
  });
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Category-wise totals", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  summary.categories.forEach((item) => {
    ensureSpace(7);
    doc.text(item.category, margin, y);
    doc.text(money(item.amount), pageWidth - margin, y, { align: "right" });
    y += 6;
  });
  doc.save(`${ledger.month}-expense-report.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}