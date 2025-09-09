'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  History,
  ListChecks,
  Plus,
  Trash2,
  User,
} from 'lucide-react';

/* ========= Types ========= */
type Priority = 'Low' | 'Medium' | 'High';
type GoalStatus = 'Active' | 'Paused' | 'Completed' | 'Dropped';
type Tried = 'Yes' | 'No' | 'Neutral';
type TriedOrEmpty = Tried | '';

interface Goal {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  priority: Priority;
  status: GoalStatus;
  progress: number;        // 0–100
  dailyWeight?: number;    // how much a fully-complete day contributes, in % (default 5)
  createdAt: string;
  updatedAt: string;
}

type PercentChoice = 0 | 5 | 20 | 50 | 100;

interface Task {
  id: string;
  goalId: string;
  title: string;
  how?: string;
  percent: PercentChoice;
  postponed?: boolean;
  postponeReason?: string;
  postponeConsequence?: string;
}

interface DayPlan {
  date: string;             // YYYY-MM-DD
  priorities: string[];     // ordered goalIds
  tasks: Task[];            // today’s tasks
  locked?: boolean;         // locked when EOD submitted
}

interface DayMeta {
  date: string;
  learned?: string;
  improve?: string;
  triedWell?: Tried;
  whyNotComplete?: string;  // required if any task < 100%
  eodSubmitted?: boolean;
}

const NAME = 'Subhanshu';
const LS_GOALS = 'goals_v2_simple';
const LS_PLANS = 'plans_v1';
const LS_META  = 'daymeta_v1';

/* ========= Helpers ========= */
const todayStr = () => new Date().toISOString().slice(0, 10);
const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return yyyymmdd(d); };
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const fmtDateLong = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const PCT: readonly PercentChoice[] = [0, 5, 20, 50, 100] as const;

/* ========= Seeds / Storage ========= */
const seedGoals: Goal[] = [
  {
    id: uid(),
    title: 'Build ML model architecture',
    description: 'From data prep to baseline to iteration.',
    startDate: todayStr(),
    endDate: yyyymmdd(new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)),
    priority: 'High',
    status: 'Active',
    progress: 10,
    dailyWeight: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: uid(),
    title: 'Run consistently',
    description: '3 sessions a week',
    startDate: todayStr(),
    endDate: yyyymmdd(new Date(Date.now() + 1000 * 60 * 60 * 24 * 90)),
    priority: 'Medium',
    status: 'Active',
    progress: 25,
    dailyWeight: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const load = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

/* ========= Pretty Ring (Today %) ========= */
function Ring({ value, size = 72 }: { value: number; size?: number }) {
  const pct = clamp(Math.round(value), 0, 100);
  const bg = `conic-gradient(hsl(var(--primary)) ${pct}%, hsl(var(--muted-foreground)/.15) ${pct}%)`;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <div className="rounded-full" style={{ width: size, height: size, background: bg }} />
      <div className="absolute rounded-full bg-background" style={{ width: size - 18, height: size - 18 }} />
      <div className="absolute text-sm font-semibold">{pct}%</div>
    </div>
  );
}

/* ========= Postpone dialog ========= */
function PostponeDialog({
  open, onOpenChange, task, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: Task | null;
  onSave: (data: { reason: string; consequence: string }) => void;
}) {
  const [reason, setReason] = useState('');
  const [consequence, setConsequence] = useState('');
  useEffect(() => { if (open) { setReason(''); setConsequence(''); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Postpone “{task?.title}”</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Why are you postponing?</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Be specific" />
          </div>
          <div>
            <Label>What are the consequences?</Label>
            <Textarea rows={2} value={consequence} onChange={(e) => setConsequence(e.target.value)} placeholder="Impact on timeline, scope, quality…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave({ reason, consequence }); onOpenChange(false); }}>
            <CheckCircle2 className="h-4 w-4 mr-2" />Confirm postpone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========= Catch-up (yesterday must be closed) ========= */
function CatchUpDialog({
  open, onClose, date, tasks, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  tasks: Task[];
  onSubmit: (meta: DayMeta) => void;
}) {
  const [learned, setLearned] = useState('');
  const [improve, setImprove] = useState('');
  const [triedWell, setTriedWell] = useState<TriedOrEmpty>('');
  const [why, setWhy] = useState('');

  const hasIncomplete = tasks.some((t) => t.percent < 100);
  const canSubmit = triedWell !== '' && (!hasIncomplete || (why && why.trim().length > 0));

  const triedFinal: Tried = (triedWell === '' ? 'Neutral' : triedWell) as Tried;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Close {date}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Please complete yesterday before planning a new day.</div>
          <div><Label>What did you learn?</Label><Textarea rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} /></div>
          <div><Label>What needs to improve?</Label><Textarea rows={2} value={improve} onChange={(e) => setImprove(e.target.value)} /></div>
          <div>
            <Label>Did you try well?</Label>
            <div className="flex gap-2 mt-1">
              {(['Yes', 'No', 'Neutral'] as const).map((k) => (
                <Button key={k} variant={triedWell === k ? 'default' : 'outline'} size="sm" onClick={() => setTriedWell(k)}>{k}</Button>
              ))}
            </div>
          </div>
          {hasIncomplete && (
            <div>
              <Label>Why didn’t you complete all tasks?</Label>
              <Textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g., underestimated scope, meetings, blocker…" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!canSubmit}
            onClick={() => onSubmit({ date, learned, improve, triedWell: triedFinal, whyNotComplete: hasIncomplete ? why : '', eodSubmitted: true })}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />Close day
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========= Main App ========= */
export default function GoalsApp() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [plans, setPlans] = useState<Record<string, DayPlan>>({});
  const [meta, setMeta]   = useState<Record<string, DayMeta>>({});
  const [ready, setReady] = useState(false);

  // postpone dialog state
  const [postTask, setPostTask] = useState<Task | null>(null);
  const [postOpen, setPostOpen] = useState(false);

  // catch-up state
  const [catchOpen, setCatchOpen] = useState(false);
  const [catchDate, setCatchDate] = useState<string>('');
  const [catchTasks, setCatchTasks] = useState<Task[]>([]);

  const today = todayStr();

  /* ---- init ---- */
  useEffect(() => {
    const g = load<Goal[]>(LS_GOALS, seedGoals);
    const p = load<Record<string, DayPlan>>(LS_PLANS, {});
    const m = load<Record<string, DayMeta>>(LS_META, {});
    setGoals(g);
    setPlans(p);
    setMeta(m);
    setReady(true);
  }, []);

  /* ---- persistence ---- */
  useEffect(() => { if (ready) save(LS_GOALS, goals); }, [goals, ready]);
  useEffect(() => { if (ready) save(LS_PLANS, plans); }, [plans, ready]);
  useEffect(() => { if (ready) save(LS_META, meta); }, [meta, ready]);

  /* ---- Ensure yesterday closed before allowing edits today ---- */
  useEffect(() => {
    if (!ready) return;
    const y = yesterdayStr();
    const yPlan = plans[y];
    const yMeta = meta[y];
    if (yPlan && !yMeta?.eodSubmitted) {
      setCatchDate(y);
      setCatchTasks(yPlan.tasks || []);
      setCatchOpen(true);
    }
  }, [ready, plans, meta]);

  const planToday = plans[today] || { date: today, priorities: [], tasks: [] };
  const todayTasks = planToday.tasks;

  /* ========= Morning Planner ========= */
  const addPriority = (goalId: string) => {
    if (planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [] };
      if (cur.priorities.includes(goalId)) return prev;
      return { ...prev, [today]: { ...cur, priorities: [...cur.priorities, goalId] } };
    });
  };
  const removePriority = (goalId: string) => {
    if (planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [] };
      return { ...prev, [today]: { ...cur, priorities: cur.priorities.filter((g) => g !== goalId) } };
    });
  };
  const movePriority = (goalId: string, dir: 'up' | 'down') => {
    if (planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [] };
      const idx = cur.priorities.indexOf(goalId);
      if (idx === -1) return prev;
      const to = dir === 'up' ? idx - 1 : idx + 1;
      if (to < 0 || to >= cur.priorities.length) return prev;
      const next = [...cur.priorities];
      [next[idx], next[to]] = [next[to], next[idx]];
      return { ...prev, [today]: { ...cur, priorities: next } };
    });
  };

  const addTask = (goalId: string, title: string, how?: string) => {
    if (!title.trim() || planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [] };
      const t: Task = { id: uid(), goalId, title: title.trim(), how, percent: 0 };
      return { ...prev, [today]: { ...cur, tasks: [t, ...cur.tasks] } };
    });
  };
  const removeTask = (taskId: string) => {
    if (planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today]; if (!cur) return prev;
      return { ...prev, [today]: { ...cur, tasks: cur.tasks.filter((t) => t.id !== taskId) } };
    });
  };

  /* ========= Day tapping ========= */
  const setTaskPercent = (taskId: string, v: PercentChoice) => {
    if (planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today]; if (!cur) return prev;
      return {
        ...prev,
        [today]: {
          ...cur,
          tasks: cur.tasks.map((t) => (t.id === taskId ? { ...t, percent: v } : t)),
        },
      };
    });
  };
  const openPostpone = (t: Task) => { setPostTask(t); setPostOpen(true); };
  const savePostpone = ({ reason, consequence }: { reason: string; consequence: string }) => {
    if (!postTask) return;
    setPlans((prev) => {
      const cur = prev[today]; if (!cur) return prev;
      return {
        ...prev,
        [today]: {
          ...cur,
          tasks: cur.tasks.map((t) =>
            t.id === postTask.id ? { ...t, postponed: true, postponeReason: reason, postponeConsequence: consequence } : t,
          ),
        },
      };
    });
  };

  /* ========= End of Day ========= */
  const [learned, setLearned] = useState('');
  const [improve, setImprove] = useState('');
  const [tried, setTried] = useState<TriedOrEmpty>('');
  const [whyNot, setWhyNot] = useState('');

  // hydrate EOD inputs if previously saved (rare)
  useEffect(() => {
    if (!ready) return;
    const m = meta[today];
    if (!m) return;
    setLearned(m.learned || '');
    setImprove(m.improve || '');
    setTried(m.triedWell ?? '');
    setWhyNot(m.whyNotComplete || '');
  }, [ready, meta, today]);

  const hasIncomplete = todayTasks.some((t) => t.percent < 100);
  const canClose = planToday.tasks.length > 0 &&
    tried !== '' &&
    (!hasIncomplete || (whyNot && whyNot.trim().length > 0));

  const closeDayAndUpdate = () => {
    if (!canClose) return;

    // 1) compute per-goal average completion and add weighted delta
    const byGoal: Record<string, { sum: number; count: number }> = {};
    for (const t of todayTasks) {
      if (!byGoal[t.goalId]) byGoal[t.goalId] = { sum: 0, count: 0 };
      byGoal[t.goalId].sum += t.percent;
      byGoal[t.goalId].count += 1;
    }

    setGoals((prev) =>
      prev.map((g) => {
        const agg = byGoal[g.id];
        if (!agg) return g;
        const avg = agg.sum / (agg.count * 100); // 0..1
        const weight = g.dailyWeight ?? 5;
        const delta = Math.round(avg * weight);
        const next = clamp(g.progress + delta, 0, 100);
        return { ...g, progress: next, updatedAt: new Date().toISOString() };
      }),
    );

    // 2) save meta & lock plan
    const triedFinal: Tried = (tried === '' ? 'Neutral' : tried) as Tried;
    const nextMeta: DayMeta = {
      date: today,
      learned, improve,
      triedWell: triedFinal,
      whyNotComplete: hasIncomplete ? whyNot : '',
      eodSubmitted: true,
    };
    setMeta((m) => ({ ...m, [today]: nextMeta }));
    setPlans((p) => ({ ...p, [today]: { ...planToday, locked: true } }));

    // 3) reset inputs for tomorrow
    setLearned(''); setImprove(''); setTried(''); setWhyNot('');
  };

  /* ========= Stats / Widgets ========= */
  const todayByGoal = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of todayTasks) {
      if (!map.has(t.goalId)) map.set(t.goalId, []);
      map.get(t.goalId)!.push(t);
    }
    return map;
  }, [todayTasks]);

  const priorities = (planToday.priorities.map((id) => goals.find((g) => g.id === id)).filter(Boolean) as Goal[]);
  const nonPriorities = goals.filter((g) => !planToday.priorities.includes(g.id) && g.status === 'Active');

  const dayStats = useMemo(() => {
    const total = todayTasks.length;
    const done = todayTasks.filter((t) => t.percent === 100).length;
    const postponed = todayTasks.filter((t) => t.postponed).length;
    const avg = total ? Math.round(todayTasks.reduce((s, t) => s + t.percent, 0) / total) : 0; // 0..100
    return { total, done, postponed, avg };
  }, [todayTasks]);

  const perGoalToday = useMemo(() => {
    return priorities.map((g) => {
      const list = todayByGoal.get(g.id) || [];
      const avg = list.length ? Math.round(list.reduce((s, t) => s + t.percent, 0) / list.length) : 0;
      const delta = Math.round((avg / 100) * (g.dailyWeight ?? 5));
      const projected = clamp(g.progress + delta, 0, 100);
      return { goal: g, avg, delta, projected };
    });
  }, [priorities, todayByGoal]); // goals dep not needed (priorities contains goal objects)

  const streak = useMemo(() => {
    let c = 0;
    const d = new Date();
    for (;;) {
      const key = yyyymmdd(d);
      const pl = plans[key];
      const mt = meta[key];
      if (pl?.locked && mt?.eodSubmitted) { c++; d.setDate(d.getDate() - 1); } else break;
    }
    return c;
  }, [plans, meta]);

  /* ========= Render ========= */
  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <User className="h-5 w-5" />
          <div>
            <div className="text-xs text-muted-foreground">Good day,</div>
            <h1 className="text-2xl font-semibold">{NAME}</h1>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground flex items-center gap-2 justify-end">
            <CalendarIcon className="h-4 w-4" />
            <span>{fmtDateLong()} • {today}</span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
            <Flame className="h-4 w-4 text-orange-500" /> <span>Streak: {streak}</span>
          </div>
        </div>
      </div>

      {/* Today Overview (widgets) */}
      <Card>
        <CardHeader>
          <CardTitle>Today Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4 items-center">
          <div className="flex items-center gap-4">
            <Ring value={dayStats.avg} />
            <div>
              <div className="text-sm text-muted-foreground">Today completion</div>
              <div className="text-2xl font-semibold">{dayStats.avg}%</div>
            </div>
          </div>

          <div className="p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground">Planned tasks</div>
            <div className="text-xl font-semibold">{dayStats.total}</div>
          </div>
          <div className="p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground">Done</div>
            <div className="text-xl font-semibold">{dayStats.done}</div>
          </div>
          <div className="p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground">Postponed</div>
            <div className="text-xl font-semibold">{dayStats.postponed}</div>
          </div>

          <div className="md:col-span-4">
            <div className="flex justify-between text-xs mb-1 text-muted-foreground">
              <span>Day progress</span><span>{dayStats.avg}%</span>
            </div>
            <Progress value={dayStats.avg} />
          </div>
        </CardContent>
      </Card>

      {/* Goals overview (lean, long-term) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> Long-term goals
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => (
            <div key={g.id} className="p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="font-medium">{g.title}</div>
                <Badge variant={g.priority === 'High' ? 'default' : 'secondary'}>{g.priority}</Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <CalendarIcon className="h-3.5 w-3.5" /> {g.startDate} → {g.endDate}
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Overall progress</span><span>{g.progress}%</span>
                </div>
                <Progress value={g.progress} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Morning planner */}
      <Card>
        <CardHeader><CardTitle>Morning plan — pick goals & tasks</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Selected priorities in order */}
          <div className="space-y-2">
            <Label className="text-sm">Today’s priorities (top to bottom)</Label>
            {priorities.length === 0 && <div className="text-xs text-muted-foreground">Pick from “Available goals” below.</div>}
            <div className="space-y-2">
              {priorities.map((g, idx) => (
                <div key={g.id} className="flex items-center justify-between p-2 rounded-md border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">{idx + 1}</span>
                    <span className="font-medium">{g.title}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => movePriority(g.id, 'up')}><ChevronUp className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => movePriority(g.id, 'down')}><ChevronDown className="h-4 w-4" /></Button>
                    <Button variant="destructive" size="icon" onClick={() => removePriority(g.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available goals */}
          <div className="space-y-2">
            <Label className="text-sm">Available goals</Label>
            <div className="flex flex-wrap gap-2">
              {nonPriorities.map((g) => (
                <Button key={g.id} variant="outline" size="sm" onClick={() => addPriority(g.id)}>{g.title}</Button>
              ))}
              {nonPriorities.length === 0 && <div className="text-xs text-muted-foreground">All active goals selected.</div>}
            </div>
          </div>

          <Separator />

          {/* Add tasks per selected goal */}
          <div className="space-y-4">
            {priorities.map((g) => (
              <GoalTasksEditor key={g.id} goal={g} tasks={todayByGoal.get(g.id) || []} onAdd={addTask} onRemove={removeTask} />
            ))}
            {priorities.length === 0 && <div className="text-xs text-muted-foreground">Select at least one goal to add tasks for today.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Today’s tasks + tap-in (with per-goal "Today avg" bars) */}
      <Card>
        <CardHeader><CardTitle>Today’s tasks — tap to update %</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {priorities.length === 0 && <div className="text-xs text-muted-foreground">No priorities selected.</div>}

          {perGoalToday.map(({ goal: g, avg }) => (
            <div key={g.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{g.title}</div>
                <div className="text-xs text-muted-foreground">Today avg: {avg}%</div>
              </div>
              <Progress value={avg} />
              {(todayByGoal.get(g.id) || []).length === 0 && (
                <div className="text-xs text-muted-foreground mb-2">No tasks added for this goal.</div>
              )}
              {(todayByGoal.get(g.id) || []).map((t) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-md border">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    {t.how ? <div className="text-xs text-muted-foreground truncate">How: {t.how}</div> : null}
                    {t.postponed ? (
                      <div className="text-xs text-amber-600 mt-1">
                        Postponed: {t.postponeReason} • Consequence: {t.postponeConsequence}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {PCT.map((v) => (
                      <Button key={v} size="sm" variant={t.percent === v ? 'default' : 'outline'} onClick={() => setTaskPercent(t.id, v)}>
                        {v}%
                      </Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => openPostpone(t)}>
                      <History className="h-4 w-4 mr-1" />Postpone
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => removeTask(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* End of day */}
      <Card>
        <CardHeader><CardTitle>End of day — lock in & update progress</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Estimated gains widget */}
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-2">If you close now</div>
            {perGoalToday.length === 0 && <div className="text-xs text-muted-foreground">No goals selected today.</div>}
            <div className="space-y-3">
              {perGoalToday.map(({ goal: g, avg, delta, projected }) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium truncate">{g.title}</span>
                    <span className="text-muted-foreground">+{delta}% → {projected}%</span>
                  </div>
                  <Progress value={projected} />
                  <div className="text-[10px] text-muted-foreground mt-1">Today avg {avg}% × weight {g.dailyWeight ?? 5}% = +{delta}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Reflection inputs */}
          <div><Label>What did you learn?</Label><Textarea rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} /></div>
          <div><Label>What needs to improve?</Label><Textarea rows={2} value={improve} onChange={(e) => setImprove(e.target.value)} /></div>
          <div>
            <Label>Did you try well?</Label>
            <div className="flex gap-2 mt-1">
              {(['Yes', 'No', 'Neutral'] as const).map((k) => (
                <Button key={k} variant={tried === k ? 'default' : 'outline'} size="sm" onClick={() => setTried(k)}>{k}</Button>
              ))}
            </div>
          </div>
          {hasIncomplete && (
            <div>
              <Label>Why didn’t you complete all tasks today?</Label>
              <Textarea rows={2} value={whyNot} onChange={(e) => setWhyNot(e.target.value)} placeholder="e.g., underestimated scope, meetings, blocker…" />
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={!canClose} onClick={closeDayAndUpdate}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Close day & update goals
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* dialogs */}
      <PostponeDialog open={postOpen} onOpenChange={setPostOpen} task={postTask} onSave={savePostpone} />
      <CatchUpDialog
        open={catchOpen}
        onClose={() => setCatchOpen(false)}
        date={catchDate}
        tasks={catchTasks}
        onSubmit={(m) => {
          setMeta((x) => ({ ...x, [catchDate]: m }));
          setPlans((p) => ({ ...p, [catchDate]: { ...(p[catchDate] || { date: catchDate, priorities: [], tasks: [] }), locked: true } }));
          setCatchOpen(false);
        }}
      />
    </div>
  );
}

/* ========= Subcomponent: per-goal task editor ========= */
function GoalTasksEditor({
  goal, tasks, onAdd, onRemove,
}: {
  goal: Goal;
  tasks: Task[];
  onAdd: (goalId: string, title: string, how?: string) => void;
  onRemove: (taskId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [how, setHow] = useState('');

  const add = () => {
    if (!title.trim()) return;
    onAdd(goal.id, title.trim(), how.trim() || undefined);
    setTitle(''); setHow('');
  };

  return (
    <div className="p-3 rounded-md border">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">{goal.title}</div>
        <div className="text-xs text-muted-foreground">Daily weight: {goal.dailyWeight ?? 5}%</div>
      </div>
      <div className="flex items-center gap-2">
        <Input placeholder="Task (tiny and clear)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="How? (optional)" value={how} onChange={(e) => setHow(e.target.value)} />
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>
      {tasks.length > 0 && (
        <div className="mt-3 space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-2 rounded-md border">
              <div className="min-w-0">
                <div className="font-medium truncate">{t.title}</div>
                {t.how ? <div className="text-xs text-muted-foreground truncate">How: {t.how}</div> : null}
              </div>
              <Button variant="destructive" size="icon" onClick={() => onRemove(t.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
