// Starter state. These dollar amounts are just placeholders carried over from
// the original Excel — the user overwrites them on the Budget screen.
// All category totals are computed as the sum of their line items (see calc.js),
// so the bi-weekly view and the profit view always agree.

export const DEFAULT_STATE = {
  settings: { name: "", pinEnabled: false, pin: "", darkMode: false, theme: "classic", themeFx: true, hasSeenWelcome: false },
  goal: 200, // bi-weekly savings goal ($)
  savingsRateGoal: 0.2, // target share of income saved (decimal, e.g. 0.2 = 20%)
  monthlyPaychecks: 2, // 2/3 (biweekly), 4/5 (weekly), or 1 (by the job)
  payFrequency: "biweekly", // "biweekly" | "weekly" | "job"
  periodStart: new Date().toISOString().slice(0, 10), // start of the current pay cycle
  income: [
    { id: "inc_p1", name: "Paycheck #1", amount: 1600 },
    { id: "inc_p2", name: "Paycheck #2", amount: 0 },
    { id: "inc_bonus", name: "Extra / Bonus", amount: 0 },
    { id: "inc_side", name: "Side Hustle / Other", amount: 0 },
  ],
  groups: {
    housing: { lines: [
      { id: "h_rent", name: "Rent / Mortgage", amount: 600 },
      { id: "h_util", name: "Electric / Gas", amount: 80 },
      { id: "h_water", name: "Water / Trash", amount: 30 },
      { id: "h_net", name: "Internet", amount: 50 },
      { id: "h_ins", name: "Renters Insurance", amount: 20 },
    ]},
    food: { lines: [
      { id: "f_groc", name: "Groceries", amount: 160 },
      { id: "f_out", name: "Eating Out", amount: 80 },
      { id: "f_coffee", name: "Coffee / Drinks", amount: 30 },
    ]},
    transport: { lines: [
      { id: "t_gas", name: "Gas", amount: 80 },
      { id: "t_ins", name: "Car Insurance", amount: 50 },
      { id: "t_pay", name: "Car Payment", amount: 140 },
      { id: "t_bus", name: "Bus / Rideshare", amount: 0 },
      { id: "t_maint", name: "Maintenance", amount: 20 },
    ]},
    debt: { lines: [
      { id: "d_cc", name: "Credit Card", amount: 50, balance: 0 },
      { id: "d_loan", name: "Student Loans", amount: 60, balance: 0 },
      { id: "d_med", name: "Medical Bills", amount: 0, balance: 0 },
      { id: "d_other", name: "Other Debt", amount: 0, balance: 0 },
    ]},
    savings: { lines: [
      { id: "s_ef", name: "Emergency Fund", amount: 50 },
      { id: "s_goal", name: "Savings Goal", amount: 40 },
      { id: "s_401k", name: "401k Extra", amount: 0 },
    ]},
    personal: { lines: [
      { id: "p_cloth", name: "Clothing", amount: 20 },
      { id: "p_ent", name: "Entertainment / Streaming", amount: 30 },
      { id: "p_health", name: "Health / Gym", amount: 20 },
      { id: "p_care", name: "Personal Care", amount: 20 },
      { id: "p_gift", name: "Gifts / Misc", amount: 20 },
    ]},
  },
  period: { week1: {}, week2: {}, cogs: { materials: 0, labor: 0, shipping: 0 }, cogsOn: false },
  monthlyActual: { housing: 0, food: 0, transport: 0, debt: 0, savings: 0, personal: 0 },
  history: [],
};
