import type { Loan } from "@/lib/types";

export type AmortRow = {
  index: number;
  date: string;
  payment: number;
  interest: number;
  principal: number;
  extra: number;
  balance: number;
};

export type AmortSummary = {
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  payoffDate: string;
  rows: AmortRow[];
};

function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/** Standard fixed-rate amortization. Returns the full schedule plus summary. */
export function amortize(loan: Loan): AmortSummary {
  const monthlyRate = (loan.apr || 0) / 100 / 12;
  const n = Math.max(1, Math.floor(loan.termMonths));
  const P = Math.max(0, loan.principal);
  const basePayment =
    monthlyRate === 0
      ? P / n
      : (P * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));

  const rows: AmortRow[] = [];
  let balance = P;
  let totalInterest = 0;
  let totalPaid = 0;
  const start = new Date(loan.startDate);
  const extra = Math.max(0, loan.extraMonthly || 0);

  for (let i = 0; i < n * 2 && balance > 0.005; i++) {
    const interest = balance * monthlyRate;
    let principal = Math.max(0, basePayment - interest);
    let extraThis = extra;
    if (principal + extraThis > balance) {
      // Final period
      extraThis = Math.max(0, balance - principal);
      if (principal > balance) principal = balance;
    }
    const payment = principal + interest + extraThis;
    balance = Math.max(0, balance - principal - extraThis);
    totalInterest += interest;
    totalPaid += payment;
    rows.push({
      index: i + 1,
      date: addMonths(start, i).toISOString(),
      payment,
      interest,
      principal,
      extra: extraThis,
      balance,
    });
  }
  return {
    monthlyPayment: basePayment,
    totalInterest,
    totalPaid,
    payoffDate: rows[rows.length - 1]?.date || loan.startDate,
    rows,
  };
}
