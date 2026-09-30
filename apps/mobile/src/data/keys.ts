/**
 * All TanStack Query keys live here. Keys are hierarchical so `invalidateQueries({ queryKey: ['expenses'] })`
 * refreshes every expenses list, etc.
 */
export interface ExpenseFilter {
  spaceId?: string;
  personal?: boolean;
  limit?: number;
}

export const qk = {
  profile: (uid: string | undefined) => ['profile', uid] as const,
  spaces: ['spaces'] as const,
  spaceList: (uid: string | undefined) => ['spaces', 'list', uid] as const,
  space: (id: string | undefined) => ['spaces', 'one', id] as const,
  spaceSummaries: (uid: string | undefined) => ['spaces', 'summaries', uid] as const,
  members: ['space-members'] as const,
  spaceMembers: (spaceId: string | undefined) => ['space-members', spaceId] as const,
  balances: ['balances'] as const,
  balancesFor: (spaceId: string | undefined) => ['balances', spaceId ?? 'all'] as const,
  myNet: (uid: string | undefined) => ['balances', 'my-net', uid] as const,
  expenses: ['expenses'] as const,
  expenseList: (f: ExpenseFilter) => ['expenses', 'list', f] as const,
  monthSpend: (uid: string | undefined, month: string) => ['expenses', 'month-spend', uid, month] as const,
  categories: ['categories'] as const,
  recurring: ['recurring'] as const,
  upcomingRecurring: (limit: number) => ['recurring', 'upcoming', limit] as const,
  dueBeforeMonthEnd: (uid: string | undefined, monthEnd: string) => ['recurring', 'due', uid, monthEnd] as const,
  inbox: ['inbox'] as const,
  inboxCount: ['inbox', 'count'] as const,
  goals: ['goals'] as const,
  activeGoal: (uid: string | undefined) => ['goals', 'active', uid] as const,
  budget: (uid: string | undefined) => ['budgets', 'monthly', uid] as const,
  insight: (uid: string | undefined) => ['insight', uid] as const,
  manualBalance: ['manual-balance'] as const,
};
