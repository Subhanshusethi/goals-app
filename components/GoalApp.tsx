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
  Minus,
  Plus,
  SquarePlus,
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
  note: string;        // short note answering how & why
  startDate: string;
  targetDate: string;  // target date (end)
  priority: Priority;
  status: GoalStatus;
  progress: number;    // 0–100
  dailyWeight?: number; // how much a fully-complete day contributes, in % (default 5)
  createdAt: string;
  updatedAt: string;
}

interface Task {
  id: string;
  goalId: string;
  title: string;
  how?: string;
  percent: number;         // 0..100 (we step by 5 via +/-)
  postponed?: boolean;     // info tag if user postponed during the day
  postponeReason?: string; // optional reason
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
  improve?: string;         // how will you improve tomorrow
  triedWell?: Tried;
  whyNotComplete?: string;  // required if any task < 100%
  eodSubmitted?: boolean;
}

const NAME = 'Subhanshu';
const LS_GOALS = 'goals_v3_longterm';
const LS_PLANS = 'plans_v2';
const LS_META  = 'daymeta_v2';

/* ========= Helpers ========= */
const todayStr = () => new Date().toISOString().slice(0, 10);
const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return yyyymmdd(d); };
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return yyyymmdd(d); };
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const step = (n: number, delta = 5) => clamp(Math.round((n + delta) / 5) * 5, 0, 100);
const fmtDateLong = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const isTried = (v: TriedOrEmpty): v is Tried => v === 'Yes' || v === 'No' || v === 'Neutral';

/* ========= Seeds / Storage ========= */
const seedGoals: Goal[] = [
  {
    id: uid(),
    title: 'Publish DL research paper',
    note: 'How: daily deep work blocks & reading. Why: career impact + mastery.',
    startDate: todayStr(),
    targetDate: yyyymmdd(new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)),
    priority: 'High',
    status: 'Active',
    progress: 10,
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

/* ========= Modals ========= */
function GoalModal({
  open, onOpenChange, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (g: Goal) => void;
}) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [targetDate, setTargetDate] = useState(todayStr());
  const [priority, setPriority] = useState<Priority>('Medium');

  useEffect(() => {
    if (open) {
      setTitle(''); setNote(''); setTargetDate(todayStr()); setPriority('Medium');
    }
  }, [open]);

  const submit = () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const g: Goal = {
      id: uid(),
      title: title.trim(),
      note: note.trim(),
      startDate: todayStr(),
      targetDate,
      priority,
      status: 'Active',
      progress: 0,
      dailyWeight: 5,
      createdAt: now,
      updatedAt: now,
    };
    onSave(g);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add long-term goal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g., Publish DL research paper" />
          </div>
          <div>
            <Label>Short note — how & why</Label>
            <Textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="How will you do it? Why does it matter?" />
          </div>
          <div>
            <Label>Target date</Label>
            <Input type="date" value={targetDate} onChange={(e)=>setTargetDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}><CheckCircle2 className="h-4 w-4 mr-2" />Save</Button>
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
  const triedFinal: Tried = isTried(triedWell) ? triedWell : 'Neutral';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Close {date}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Please complete yesterday before planning a new day.</div>
          <div><Label>What did you learn?</Label><Textarea rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} /></div>
          <div><Label>How will you improve tomorrow?</Label><Textarea rows={2} value={improve} onChange={(e) => setImprove(e.target.value)} /></div>
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
              <Label>Why weren’t tasks completed?</Label>
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

  // modals
  const [goalOpen, setGoalOpen] = useState(false);

  // catch-up state
  const [catchOpen, setCatchOpen] = useState(false);
  const [catchDate, setCatchDate] = useState<string>('');
  const [catchTasks, setCatchTasks] = useState<Task[]>([]);

  // EOD postpone selections
  const [postponeMap, setPostponeMap] = useState<Record<string, boolean>>({});

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

  /* ========= Goal CRUD ========= */
  const addGoal = (g: Goal) => setGoals(prev => [g, ...prev]);
  const removeGoal = (id: string) => setGoals(prev => prev.filter(x=>x.id!==id));

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
  const incTask = (taskId: string, delta: number) => {
    if (planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today]; if (!cur) return prev;
      return {
        ...prev,
        [today]: {
          ...cur,
          tasks: cur.tasks.map((t) => (t.id === taskId ? { ...t, percent: step(t.percent + delta) } : t)),
        },
      };
    });
  };
  // Week helpers: ISO week starting Monday
const startOfWeek = (isoDate: string) => {
  const d = new Date(isoDate + 'T00:00:00');
  // make Monday=0 … Sunday=6
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return yyyymmdd(d);
};

const endOfWeek = (isoDate: string) => {
  const s = new Date(startOfWeek(isoDate) + 'T00:00:00');
  s.setDate(s.getDate() + 6);
  return yyyymmdd(s);
};

const dateRange = (start: string, end: string) => {
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  while (d <= e) {
    out.push(yyyymmdd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
};

  const setQuick = (taskId: string, v: number) => {
    if (planToday.locked) return;
    setPlans((prev) => {
      const cur = prev[today]; if (!cur) return prev;
      return {
        ...prev,
        [today]: {
          ...cur,
          tasks: cur.tasks.map((t) => (t.id === taskId ? { ...t, percent: clamp(v,0,100) } : t)),
        },
      };
    });
  };

  /* ========= End of Day ========= */
  const [learned, setLearned] = useState('');
  const [improve, setImprove] = useState('');
  const [tried, setTried] = useState<TriedOrEmpty>('');
  const [whyNot, setWhyNot] = useState('');

  // hydrate EOD inputs if previously saved
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

    // 2) build tomorrow plan if needed; move postponed items
    const tomorrow = tomorrowStr();
    const incomplete = todayTasks.filter(t => t.percent < 100 && postponeMap[t.id]);
    if (incomplete.length) {
      setPlans(prev => {
        const tPlan = prev[tomorrow] || { date: tomorrow, priorities: [], tasks: [] };
        // ensure priorities include the goals of postponed tasks (keep order from today if possible)
        const addGoals = Array.from(new Set(incomplete.map(t => t.goalId)));
        const mergedPriorities = [...tPlan.priorities];
        for (const gid of addGoals) if (!mergedPriorities.includes(gid)) mergedPriorities.push(gid);
        const moved: Task[] = incomplete.map(t => ({
          id: uid(), goalId: t.goalId, title: t.title, how: t.how, percent: 0,
        }));
        return {
          ...prev,
          [tomorrow]: { ...tPlan, priorities: mergedPriorities, tasks: [...moved, ...tPlan.tasks] },
          [today]: { ...(prev[today] || planToday), locked: true }, // lock today
        };
      });
    } else {
      setPlans(prev => ({ ...prev, [today]: { ...(prev[today] || planToday), locked: true } }));
    }

    // 3) save meta (reflection & accountability)
    const triedFinal: Tried = isTried(tried) ? tried : 'Neutral';
    const nextMeta: DayMeta = {
      date: today,
      learned, improve,
      triedWell: triedFinal,
      whyNotComplete: hasIncomplete ? whyNot : '',
      eodSubmitted: true,
    };
    setMeta((m) => ({ ...m, [today]: nextMeta }));

    // 4) reset EOD UI state
    setLearned(''); setImprove(''); setTried(''); setWhyNot(''); setPostponeMap({});
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

  // --- Weekly goal-centric progress (Mon–Sun of the current week) ---
const weekStats = useMemo(() => {
  const start = startOfWeek(today);
  const end = endOfWeek(today);
  const days = dateRange(start, end);

  let actual = 0; // sum of deltas applied across all goals/days
  let max = 0;    // sum of dailyWeight for goals that had tasks that day

  // aggregate per-goal for the week (for mini bars)
  const perGoalAgg = new Map<string, { title: string; actual: number; max: number }>();

  for (const day of days) {
    const dayPlan = plans[day];
    if (!dayPlan || dayPlan.tasks.length === 0) continue;

    // group tasks by goal for that day
    const byGoal = new Map<string, Task[]>();
    for (const t of dayPlan.tasks) {
      const arr = byGoal.get(t.goalId) || [];
      arr.push(t);
      byGoal.set(t.goalId, arr);
    }

    // compute delta per goal for that day
    byGoal.forEach((list, gid) => {
      const g = goals.find((x) => x.id === gid);
      const weight = g?.dailyWeight ?? 5;
      const avg = Math.round(list.reduce((s, t) => s + t.percent, 0) / list.length); // 0..100
      const delta = Math.round((avg / 100) * weight); // integer points

      actual += delta;
      max += weight;

      const current = perGoalAgg.get(gid) || { title: g?.title ?? 'Unknown goal', actual: 0, max: 0 };
      current.actual += delta;
      current.max += weight;
      perGoalAgg.set(gid, current);
    });
  }

  const percent = max ? Math.round((actual / max) * 100) : 0;

  const perGoal = Array.from(perGoalAgg.entries())
    .map(([id, v]) => ({
      id,
      title: v.title,
      percent: v.max ? Math.round((v.actual / v.max) * 100) : 0,
      actual: v.actual,
      max: v.max,
    }))
    .sort((a, b) => b.actual - a.actual);

  return { start, end, actual, max, percent, perGoal };
}, [plans, goals, today]);


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
  }, [priorities, todayByGoal]);

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

      {/* Today Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Today Overview</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={()=>setGoalOpen(true)}><SquarePlus className="h-4 w-4 mr-1" />Add Goal</Button>
            </div>
          </CardTitle>
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
      {/* This Week (Goal-centric) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>This Week (Goal-centric)</span>
            <span className="text-xs text-muted-foreground">
              {weekStats.start} → {weekStats.end}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4 items-center">
            <div className="flex items-center gap-4">
              <Ring value={weekStats.percent} />
              <div>
                <div className="text-sm text-muted-foreground">Weekly completion</div>
                <div className="text-2xl font-semibold">{weekStats.percent}%</div>
                <div className="text-xs text-muted-foreground">
                  Actual {weekStats.actual} / Max {weekStats.max} pts
                </div>
              </div>
            </div>
            {/* quick stats */}
            <div className="p-3 rounded-lg border md:col-span-3">
              <div className="text-xs text-muted-foreground mb-2">Per-goal momentum this week</div>
              {weekStats.perGoal.length === 0 && (
                <div className="text-xs text-muted-foreground">No activity yet this week.</div>
              )}
              <div className="space-y-2">
                {weekStats.perGoal.slice(0, 5).map((g) => (
                  <div key={g.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium truncate">{g.title}</span>
                      <span className="text-muted-foreground">
                        {g.percent}% • {g.actual}/{g.max} pts
                      </span>
                    </div>
                    <Progress value={g.percent} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Long-term goals */}
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
              <div className="text-xs text-muted-foreground mt-1">{g.note}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <CalendarIcon className="h-3.5 w-3.5" /> {g.startDate} → {g.targetDate}
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Overall progress</span><span>{g.progress}%</span>
                </div>
                <Progress value={g.progress} />
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="destructive" size="sm" onClick={()=>removeGoal(g.id)}><Trash2 className="h-4 w-4 mr-1" />Remove</Button>
              </div>
            </div>
          ))}
          {goals.length === 0 && <div className="text-xs text-muted-foreground">No goals yet—add one above.</div>}
        </CardContent>
      </Card>

      {/* Morning planner */}
      <Card>
        <CardHeader><CardTitle>Morning plan — pick goals & tasks</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Selected priorities in order */}
          <div className="space-y-2">
            <Label className="text-sm">Today’s priorities (top to bottom)</Label>
            {planToday.priorities.length === 0 && <div className="text-xs text-muted-foreground">Pick from “Available goals” below.</div>}
            <div className="space-y-2">
              {planToday.priorities.map((gid, idx) => {
                const g = goals.find(x=>x.id===gid);
                if (!g) return null;
                return (
                  <div key={gid} className="flex items-center justify-between p-2 rounded-md border">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{idx + 1}</span>
                      <span className="font-medium">{g.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" onClick={() => movePriority(gid, 'up')}><ChevronUp className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" onClick={() => movePriority(gid, 'down')}><ChevronDown className="h-4 w-4" /></Button>
                      <Button variant="destructive" size="icon" onClick={() => removePriority(gid)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Available goals */}
          <div className="space-y-2">
            <Label className="text-sm">Available goals</Label>
            <div className="flex flex-wrap gap-2">
              {goals.filter(g=>!planToday.priorities.includes(g.id) && g.status==='Active').map((g) => (
                <Button key={g.id} variant="outline" size="sm" onClick={() => addPriority(g.id)}>{g.title}</Button>
              ))}
              {goals.filter(g=>!planToday.priorities.includes(g.id) && g.status==='Active').length === 0 && (
                <div className="text-xs text-muted-foreground">All active goals selected.</div>
              )}
            </div>
          </div>

          <Separator />

          {/* Add tasks per selected goal */}
          <div className="space-y-4">
            {planToday.priorities.map((gid) => {
              const g = goals.find(x=>x.id===gid);
              if (!g) return null;
              return (
                <GoalTasksEditor
                  key={gid}
                  goal={g}
                  tasks={(plans[today]?.tasks || []).filter(t=>t.goalId===gid)}
                  onAdd={addTask}
                  onRemove={removeTask}
                />
              );
            })}
            {planToday.priorities.length === 0 && <div className="text-xs text-muted-foreground">Select at least one goal to add tasks for today.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Today’s tasks — interactive tap-in */}
      <Card>
        <CardHeader><CardTitle>Today’s tasks — tap “+” to log progress</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {planToday.priorities.map((gid) => {
            const g = goals.find(x=>x.id===gid); if (!g) return null;
            const list = (plans[today]?.tasks || []).filter(t=>t.goalId===gid);
            const avg = list.length ? Math.round(list.reduce((s, t) => s + t.percent, 0) / list.length) : 0;
            return (
              <div key={gid} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{g.title}</div>
                  <div className="text-xs text-muted-foreground">Today avg: {avg}%</div>
                </div>
                <Progress value={avg} />
                {list.length === 0 && <div className="text-xs text-muted-foreground">No tasks added for this goal.</div>}
                {list.map((t)=>(
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-md border">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.title}</div>
                      {t.how ? <div className="text-xs text-muted-foreground truncate">How: {t.how}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={()=>incTask(t.id, -5)} aria-label="decrease"><Minus className="h-4 w-4" /></Button>
                      <div className="w-14 text-center text-sm font-medium">{t.percent}%</div>
                      <Button variant="outline" size="icon" onClick={()=>incTask(t.id, +5)} aria-label="increase"><Plus className="h-4 w-4" /></Button>
                      {/* quick jumps */}
                      {[0,25,50,100].map(v=>(
                        <Button key={v} variant={t.percent===v?'default':'outline'} size="sm" onClick={()=>setQuick(t.id, v)}>{v}%</Button>
                      ))}
                      <Button variant="destructive" size="icon" onClick={()=>removeTask(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {planToday.priorities.length === 0 && <div className="text-xs text-muted-foreground">No priorities selected.</div>}
        </CardContent>
      </Card>

      {/* End of day */}
      <Card>
        <CardHeader><CardTitle>End of day — reflect, postpone, update goals</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Estimated gains */}
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

          {/* Incomplete tasks → choose Postpone */}
          {hasIncomplete && (
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium mb-2">Incomplete today — move to tomorrow?</div>
              <div className="space-y-2">
                {todayTasks.filter(t=>t.percent<100).map(t => {
                  const g = goals.find(x=>x.id===t.goalId);
                  return (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!postponeMap[t.id]}
                        onChange={(e)=> setPostponeMap(m => ({...m, [t.id]: e.target.checked}))}
                      />
                      <span className="font-medium">{t.title}</span>
                      <span className="text-xs text-muted-foreground">({g?.title})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reflection inputs */}
          <div><Label>Why weren’t tasks completed?</Label><Textarea rows={2} value={whyNot} onChange={(e) => setWhyNot(e.target.value)} placeholder="Be specific—what blocked you?" /></div>
          <div><Label>Did you really try well?</Label>
            <div className="flex gap-2 mt-1">
              {(['Yes', 'No', 'Neutral'] as const).map((k) => (
                <Button key={k} variant={tried === k ? 'default' : 'outline'} size="sm" onClick={() => setTried(k)}>{k}</Button>
              ))}
            </div>
          </div>
          <div><Label>How will you improve tomorrow?</Label><Textarea rows={2} value={improve} onChange={(e) => setImprove(e.target.value)} /></div>
          <div><Label>What did you learn today?</Label><Textarea rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} /></div>

          <div className="flex justify-end">
            <Button disabled={!canClose} onClick={closeDayAndUpdate}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Close day & update goals
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* dialogs */}
      <GoalModal open={goalOpen} onOpenChange={setGoalOpen} onSave={addGoal}/>
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

/* ========= Subcomponents ========= */
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
        <Input placeholder="Task (tiny and specific)" value={title} onChange={(e) => setTitle(e.target.value)} />
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
