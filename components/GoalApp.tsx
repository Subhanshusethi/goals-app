'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
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
  ListChecks,
  Minus,
  Plus,
  SquarePlus,
  Trash2,
  User,
  Timer as TimerIcon,
  History as HistoryIcon,
} from 'lucide-react';

/* ========= Types ========= */
type Priority = 'Low' | 'Medium' | 'High';
type GoalStatus = 'Active' | 'Paused' | 'Completed' | 'Dropped';
type Tried = 'Yes' | 'No' | 'Neutral';

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
}

interface FocusSession {
  id: string;
  startISO: string;
  endISO: string;
  durationMin: number;
  acknowledgedAt: string[]; // ISO timestamps for each 15-min ack
  status: 'completed' | 'failed' | 'canceled';
}

interface DayPlan {
  date: string;                         // YYYY-MM-DD
  priorities: string[];                 // ordered goalIds
  tasks: Task[];                        // today’s tasks
  credits?: Record<string, number>;     // goalId -> integer delta applied today
  postponeFlags?: Record<string, boolean>; // taskId -> true if user chose to move to tomorrow
  carriedFrom?: string;                 // last date we auto-carried from (e.g., yesterday)
  focusedCount?: number;                // completed focused sessions today
  focusedSessions?: FocusSession[];     // log of focus sessions for this date
}

interface DayMeta {
  date: string;
  learned?: string;
  improve?: string;
  triedWell?: Tried;
  whyNotComplete?: string;
}

const NAME = 'Subhanshu';
const LS_GOALS = 'goals_v3_longterm';
const LS_PLANS = 'plans_v5_focus_history';
const LS_META  = 'daymeta_v3_reflection';

/* ========= Helpers ========= */
const todayStr = () => new Date().toISOString().slice(0, 10);
const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const step = (n: number, delta = 5) => clamp(Math.round((n + delta) / 5) * 5, 0, 100);
const fmtDateLong = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate()-1); return yyyymmdd(d); };

/** Inclusive days left: 9→11 = 3, if past due returns 0 */
const daysLeftInclusive = (fromISO: string, toISO: string): number => {
  const from = new Date(fromISO + 'T00:00:00');
  const to = new Date(toISO + 'T00:00:00');
  const diff = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  return diff < 0 ? 0 : diff + 1;
};

/** Positive days overdue if after target */
const daysOverdue = (fromISO: string, toISO: string): number => {
  const from = new Date(fromISO + 'T00:00:00');
  const to = new Date(toISO + 'T00:00:00');
  const diff = Math.floor((from.getTime() - to.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
};

/** With current weight: what daily average % is needed to hit the date? */
const requiredAvgWithCurrentWeight = (remainingPct: number, daysLeft: number, weight: number): number => {
  if (remainingPct <= 0) return 0;
  if (daysLeft <= 0 || weight <= 0) return 100;
  const needed = Math.ceil((remainingPct / (daysLeft * weight)) * 100);
  return clamp(needed, 0, 100);
};

/** If user typically averages `expectedAvgPct` per day, what daily weight should they set to hit the date? */
const suggestedWeightToHit = (remainingPct: number, daysLeft: number, expectedAvgPct: number): number => {
  if (remainingPct <= 0) return 5;
  const eff = expectedAvgPct / 100;
  if (daysLeft <= 0 || eff <= 0) return 5;
  const w = Math.ceil(remainingPct / (daysLeft * eff));
  return clamp(w, 1, 100);
};

const load = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

/* ========= Week / Calendar helpers ========= */
// ISO week starting Monday
const startOfWeek = (isoDate: string) => {
  const d = new Date(isoDate + 'T00:00:00');
  const weekday = (d.getDay() + 6) % 7; // Mon=0…Sun=6
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

/* ========= Pretty Ring (percentage) ========= */
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

/* ========= Focused Session Panel ========= */
function FocusPanel({
  dateKey, plan, setPlans,
}: {
  dateKey: string;
  plan: DayPlan;
  setPlans: React.Dispatch<React.SetStateAction<Record<string, DayPlan>>>;
}) {
  const [durationMin, setDurationMin] = useState<number>(30);
  const [running, setRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  const [needsAck, setNeedsAck] = useState(false);
  const [ackDeadline, setAckDeadline] = useState<number | null>(null);
  const [nextAckAt, setNextAckAt] = useState<number | null>(null);
  const [ackTimes, setAckTimes] = useState<string[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // cleanup
  useEffect(() => () => { if (tickRef.current) window.clearInterval(tickRef.current); }, []);

  const recordSession = (status: FocusSession['status']) => {
    const startISO = startTimeRef.current ? new Date(startTimeRef.current).toISOString() : new Date().toISOString();
    const endISO = new Date().toISOString();
    const session: FocusSession = {
      id: uid(),
      startISO,
      endISO,
      durationMin,
      acknowledgedAt: [...ackTimes],
      status,
    };
    setPlans(prev => {
      const cur = prev[dateKey] || { date: dateKey, priorities: [], tasks: [] };
      const fc = cur.focusedCount ?? 0;
      const list = cur.focusedSessions ?? [];
      let nextFocusedCount = fc;
      let nextList = list;

      if (status === 'completed') {
        nextFocusedCount = fc + 1;
        nextList = [session, ...list];
      } else if (status === 'failed') {
        // per requirement: reset to 0 and discard sessions
        nextFocusedCount = 0;
        nextList = [];
      } else {
        // canceled: keep existing, just log it (optional: comment out to ignore canceled)
        nextList = [session, ...list];
      }
      return { ...prev, [dateKey]: { ...cur, focusedCount: nextFocusedCount, focusedSessions: nextList } };
    });
  };

  const stopTimer = (status: FocusSession['status']) => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    setRunning(false);
    setNeedsAck(false);
    setAckDeadline(null);
    setNextAckAt(null);
    startTimeRef.current = null;
    setRemainingSec(0);
    recordSession(status);
    setAckTimes([]);
  };

  const startTimer = () => {
    const dur = Math.max(30, Math.round(durationMin)); // enforce 30 min minimum
    const now = Date.now();
    startTimeRef.current = now;
    const total = dur * 60;
    setRemainingSec(total);
    setRunning(true);
    setNeedsAck(false);
    setAckDeadline(null);
    setAckTimes([]);
    setNextAckAt(now + 15 * 60 * 1000); // first ack after 15 min

    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setRemainingSec((old) => {
        const newVal = old - 1;
        return newVal >= 0 ? newVal : 0;
      });

      const t = Date.now();

      // trigger ack requirement
      setNextAckAt((na) => {
        if (!na) return na;
        if (t >= na && !needsAck) {
          setNeedsAck(true);
          setAckDeadline(t + 60 * 1000); // 60s grace
        }
        return na;
      });

      // check ack timeout
      setAckDeadline((dl) => {
        if (dl && needsAck && t > dl) {
          // failed: missed acknowledgement
          stopTimer('failed');
          return null;
        }
        return dl;
      });

      // finish timer
      setRemainingSec((val) => {
        if (val <= 1 && running) {
          // finishing now
          // must not be waiting for ack
          if (!needsAck) {
            stopTimer('completed');
          } else {
            // if timer ends while ack pending, treat as fail
            stopTimer('failed');
          }
        }
        return val;
      });
    }, 1000) as unknown as number;
  };

  const acknowledge = () => {
    if (!needsAck) return;
    setNeedsAck(false);
    setAckDeadline(null);
    setAckTimes((arr) => [...arr, new Date().toISOString()]);
    // schedule next 15-min checkpoint
    setNextAckAt(Date.now() + 15 * 60 * 1000);
  };

  const cancel = () => {
    if (!running) return;
    stopTimer('canceled');
  };

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const totalSec = Math.max(1, Math.max(30, Math.round(durationMin)) * 60);
  const pct = running ? Math.round(((totalSec - remainingSec) / totalSec) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TimerIcon className="h-5 w-5" />
          Focused session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!running ? (
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Label>Duration (min, ≥30)</Label>
              <Input
                type="number"
                className="w-28"
                min={30}
                value={durationMin}
                onChange={(e)=> setDurationMin(Number(e.target.value))}
              />
            </div>
            <div className="flex gap-2">
              {[30, 45, 60].map(v => (
                <Button key={v} variant={durationMin===v?'default':'outline'} size="sm" onClick={()=>setDurationMin(v)}>{v}m</Button>
              ))}
            </div>
            <div className="flex-1" />
            <Button onClick={startTimer}><TimerIcon className="h-4 w-4 mr-1" />Start</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <Ring value={pct} size={84} />
              <div className="text-3xl font-semibold tabular-nums">
                {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
              </div>
              <div className="flex-1" />
              <Button variant="destructive" onClick={cancel}>Cancel</Button>
            </div>
            {needsAck ? (
              <div className="p-3 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20">
                <div className="text-sm font-medium text-red-600 dark:text-red-400">Acknowledge to keep the session!</div>
                <div className="text-xs text-muted-foreground mb-2">If you don’t acknowledge within ~60s, this session will fail and your today count resets to 0.</div>
                <Button onClick={acknowledge}><CheckCircle2 className="h-4 w-4 mr-1" />Acknowledge</Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Next checkpoint in 15 minutes… stay focused.</div>
            )}
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border">
            <div className="text-xs text-muted-foreground">Focused sessions today</div>
            <div className="text-xl font-semibold">{plan.focusedCount ?? 0}</div>
          </div>
          <div className="p-3 rounded-lg border col-span-2">
            <div className="text-xs text-muted-foreground mb-2">Recent sessions</div>
            {(plan.focusedSessions?.length ?? 0) === 0 && (
              <div className="text-xs text-muted-foreground">No sessions yet today.</div>
            )}
            <div className="space-y-1 max-h-28 overflow-auto">
              {(plan.focusedSessions ?? []).slice(0,5).map(s => (
                <div key={s.id} className="text-xs flex items-center justify-between">
                  <span>{new Date(s.startISO).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} → {new Date(s.endISO).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                  <span className={`px-2 py-0.5 rounded-full ${s.status==='completed'?'bg-green-200 text-green-900 dark:bg-green-900/40 dark:text-green-300':'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300'}`}>
                    {s.status} • {s.durationMin}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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

  // history modal
  const [histOpen, setHistOpen] = useState(false);
  const [histDate, setHistDate] = useState<string | null>(null);

  const today = todayStr();

  /* ---- init ---- */
  useEffect(() => {
    const g = load<Goal[]>(LS_GOALS, [
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
    ]);
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

  /* ---- auto-carry postponed tasks from yesterday into today (runs once per day) ---- */
  useEffect(() => {
    if (!ready) return;
    const y = yesterdayStr();
    const yPlan = plans[y];
    const tPlan = plans[today] || { date: today, priorities: [], tasks: [], credits: {}, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };

    if (tPlan.carriedFrom === y) return;

    if (!yPlan) {
      setPlans(prev => ({ ...prev, [today]: { ...tPlan, carriedFrom: y, focusedCount: tPlan.focusedCount ?? 0, focusedSessions: tPlan.focusedSessions ?? [] } }));
      return;
    }

    const flags = yPlan.postponeFlags || {};
    const toMove = yPlan.tasks.filter(t => flags[t.id] && t.percent < 100);

    const carryGoalIds = Array.from(new Set(toMove.map(t => t.goalId)));
    const nextPriorities = [...tPlan.priorities];
    for (const gid of carryGoalIds) if (!nextPriorities.includes(gid)) nextPriorities.push(gid);

    const copies: Task[] = toMove.map(t => ({ id: uid(), goalId: t.goalId, title: t.title, how: t.how, percent: 0 }));

    setPlans(prev => ({
      ...prev,
      [today]: {
        ...tPlan,
        carriedFrom: y,
        priorities: nextPriorities,
        tasks: [...copies, ...tPlan.tasks],
        focusedCount: tPlan.focusedCount ?? 0,
        focusedSessions: tPlan.focusedSessions ?? [],
      }
    }));
  }, [ready, plans, today]);

  const planToday: DayPlan = plans[today] || { date: today, priorities: [], tasks: [], credits: {}, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };
  const todayTasks = planToday.tasks;

  /* ========= Goal CRUD ========= */
  const addGoal = (g: Goal) => setGoals(prev => [g, ...prev]);
  const removeGoal = (id: string) => {
    setGoals(prev => prev.filter(x=>x.id!==id));
    // also strip from today's plan for cleanliness
    setPlans(prev => {
      const cur = prev[today];
      if (!cur) return prev;
      return {
        ...prev,
        [today]: {
          ...cur,
          priorities: cur.priorities.filter(pid => pid !== id),
          tasks: cur.tasks.filter(t => t.goalId !== id),
        }
      };
    });
  };
  const updateGoalWeight = (id: string, w: number) =>
    setGoals(prev => prev.map(g => g.id === id ? { ...g, dailyWeight: clamp(Math.round(w), 1, 100), updatedAt: new Date().toISOString() } : g));

  /* ========= Morning Planner ========= */
  const addPriority = (goalId: string) => {
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [], credits: {}, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };
      if (cur.priorities.includes(goalId)) return prev;
      return { ...prev, [today]: { ...cur, priorities: [...cur.priorities, goalId] } };
    });
  };
  const removePriority = (goalId: string) => {
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [], credits: {}, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };
      return { ...prev, [today]: { ...cur, priorities: cur.priorities.filter((g) => g !== goalId) } };
    });
  };
  const movePriority = (goalId: string, dir: 'up' | 'down') => {
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [], credits: {}, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };
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
    if (!title.trim()) return;
    setPlans((prev) => {
      const cur = prev[today] || { date: today, priorities: [], tasks: [], credits: {}, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };
      const t: Task = { id: uid(), goalId, title: title.trim(), how, percent: 0 };
      return { ...prev, [today]: { ...cur, tasks: [t, ...cur.tasks] } };
    });
  };
  const removeTask = (taskId: string) => {
    setPlans((prev) => {
      const cur = prev[today]; if (!cur) return prev;
      const newTasks = cur.tasks.filter((t) => t.id !== taskId);
      const { [taskId]: _omit, ...restFlags } = cur.postponeFlags || {};
      return { ...prev, [today]: { ...cur, tasks: newTasks, postponeFlags: restFlags } };
    });
  };

  /* ========= Day tapping ========= */
  const incTask = (taskId: string, delta: number) => {
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
  const setQuick = (taskId: string, v: number) => {
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

  /* ========= DYNAMIC PROGRESS APPLIER =========
     - Computes per-goal credit = round(avg(today)% * dailyWeight / 100)
     - Applies ONLY the difference from last applied credit (stored in plan.credits)
  */
  useEffect(() => {
    if (!ready) return;

    const cur = plans[today] || { date: today, priorities: [], tasks: [], credits: {} as Record<string, number>, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };
    const prevCredits = cur.credits || {};

    // group today's tasks by goal
    const byGoal = new Map<string, Task[]>();
    for (const t of cur.tasks) {
      const arr = byGoal.get(t.goalId) || [];
      arr.push(t);
      byGoal.set(t.goalId, arr);
    }

    // compute new credits
    const nextCredits: Record<string, number> = {};
    byGoal.forEach((list, gid) => {
      const g = goals.find(x => x.id === gid);
      const weight = g?.dailyWeight ?? 5;
      const avg = Math.round(list.reduce((s, t) => s + t.percent, 0) / list.length); // 0..100
      const delta = Math.round((avg / 100) * weight); // integer points
      nextCredits[gid] = delta;
    });

    // include goals that had previous credits but now no tasks → credit becomes 0
    Object.keys(prevCredits).forEach(gid => {
      if (!(gid in nextCredits)) nextCredits[gid] = 0;
    });

    // detect changes
    const changed = (() => {
      const keys = new Set([...Object.keys(prevCredits), ...Object.keys(nextCredits)]);
      for (const k of keys) if ((prevCredits[k] || 0) !== (nextCredits[k] || 0)) return true;
      return false;
    })();

    if (!changed) return;

    // apply diffs to goal.progress
    setGoals(prev => prev.map(g => {
      const before = prevCredits[g.id] || 0;
      const after = nextCredits[g.id] || 0;
      const diff = after - before;
      if (diff === 0) return g;
      return { ...g, progress: clamp(g.progress + diff, 0, 100), updatedAt: new Date().toISOString() };
    }));

    // persist new credits
    setPlans(prev => ({
      ...prev,
      [today]: { ...cur, credits: nextCredits }
    }));
  }, [ready, plans, goals, today]);

  /* ========= Stats / Widgets ========= */
  const todayByGoal = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of todayTasks) {
      if (!map.has(t.goalId)) map.set(t.goalId, []);
      map.get(t.goalId)!.push(t);
    }
    return map;
  }, [todayTasks]);

  const prioritiesList = (planToday.priorities.map((id) => goals.find((g) => g.id === id)).filter(Boolean) as Goal[]);
  const nonPriorities = goals.filter((g) => !planToday.priorities.includes(g.id) && g.status === 'Active');

  // --- Weekly goal-centric progress (Mon–Sun of the current week) ---
  const weekStats = useMemo(() => {
    const start = startOfWeek(today);
    const end = endOfWeek(today);
    const days = dateRange(start, end);

    let actual = 0; // sum of deltas applied across all goals/days
    let max = 0;    // sum of dailyWeight for goals that had tasks that day
    const perGoalAgg = new Map<string, { title: string; actual: number; max: number }>();

    for (const day of days) {
      const dayPlan = plans[day];
      if (!dayPlan || dayPlan.tasks.length === 0) continue;

      const byGoal = new Map<string, Task[]>();
      for (const t of dayPlan.tasks) {
        const arr = byGoal.get(t.goalId) || [];
        arr.push(t);
        byGoal.set(t.goalId, arr);
      }

      byGoal.forEach((list, gid) => {
        const g = goals.find((x) => x.id === gid);
        const weight = g?.dailyWeight ?? 5;
        const avg = Math.round(list.reduce((s, t) => s + t.percent, 0) / list.length); // 0..100
        const delta = Math.round((avg / 100) * weight);
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
    const avg = total ? Math.round(todayTasks.reduce((s, t) => s + t.percent, 0) / total) : 0; // 0..100
    return { total, done, avg };
  }, [todayTasks]);

  const perGoalToday = useMemo(() => {
    return prioritiesList.map((g) => {
      const list = todayByGoal.get(g.id) || [];
      const avg = list.length ? Math.round(list.reduce((s, t) => s + t.percent, 0) / list.length) : 0;
      const delta = Math.round((avg / 100) * (g.dailyWeight ?? 5));
      const projected = clamp(g.progress, 0, 100); // progress is live-applied
      return { goal: g, avg, delta, projected };
    });
  }, [prioritiesList, todayByGoal, goals]);

  const streak = useMemo(() => {
    // consecutive days ending today where any task had percent > 0
    let c = 0;
    const d = new Date();
    for (;;) {
      const key = yyyymmdd(d);
      const pl = plans[key];
      const didWork = !!pl && pl.tasks.some(t => t.percent > 0);
      if (didWork) { c++; d.setDate(d.getDate() - 1); } else break;
    }
    return c;
  }, [plans]);

  /* ========= Reflection (auto-save) ========= */
  const metaToday = meta[today] || { date: today } as DayMeta;
  const setMetaField = <K extends keyof DayMeta>(key: K, value: DayMeta[K]) => {
    setMeta(prev => ({ ...prev, [today]: { ...prev[today], date: today, [key]: value } as DayMeta }));
  };

  /* ========= History helpers ========= */
  const dayAverageFor = (isoDate: string) => {
    const pl = plans[isoDate];
    if (!pl || pl.tasks.length === 0) return null; // null means "no data"
    const avg = Math.round(pl.tasks.reduce((s, t) => s + t.percent, 0) / pl.tasks.length);
    return avg; // 0..100
  };

  const [calBase, setCalBase] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const calYear = calBase.getFullYear();
  const calMonth = calBase.getMonth(); // 0..11
  const firstOfMonth = new Date(calYear, calMonth, 1);
  const lastOfMonth = new Date(calYear, calMonth + 1, 0);

  // Build a 6-week grid starting Monday
  const monthGrid = useMemo(() => {
    const first = new Date(firstOfMonth);
    const weekday = (first.getDay() + 6) % 7; // Mon=0
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - weekday);

    const cells: { iso: string; inMonth: boolean; avg: number | null }[] = [];
    for (let i = 0; i < 42; i++) { // 6 weeks
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = yyyymmdd(d);
      const inMonth = d.getMonth() === calMonth;
      const avg = dayAverageFor(iso);
      cells.push({ iso, inMonth, avg });
    }
    return cells;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, calYear, calMonth]);

  const colorForAvg = (avg: number | null) => {
    if (avg === null) return 'bg-muted';
    if (avg > 70) return 'bg-green-500/80 text-white';
    if (avg > 50) return 'bg-yellow-400/80 text-black';
    return 'bg-red-500/80 text-white';
  };

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
        <CardContent className="grid gap-4 md:grid-cols-5 items-center">
          <div className="flex items-center gap-4 md:col-span-2">
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
            <div className="text-xs text-muted-foreground">Focused sessions</div>
            <div className="text-xl font-semibold">{planToday.focusedCount ?? 0}</div>
          </div>

          <div className="md:col-span-5">
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
              {(() => {
                const s = startOfWeek(today); const e = endOfWeek(today); return `${s} → ${e}`;
              })()}
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

      {/* Long-term goals (with Deadline Helper) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> Long-term goals
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => {
            const daysLeft = daysLeftInclusive(today, g.targetDate);
            const overdue = daysOverdue(today, g.targetDate);
            const remaining = clamp(100 - g.progress, 0, 100);
            const weight = g.dailyWeight ?? 5;
            const reqAvg = requiredAvgWithCurrentWeight(remaining, daysLeft, weight);

            const typical = 70;
            const suggestedW = suggestedWeightToHit(remaining, daysLeft, typical);
            const impossibleWithCurrent = daysLeft > 0 && reqAvg > 100;

            return (
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

                <div className="mt-3 p-2 rounded-md border">
                  {remaining <= 0 ? (
                    <div className="text-xs text-muted-foreground">Goal completed 🎉</div>
                  ) : overdue > 0 ? (
                    <div className="text-xs text-red-500">Past deadline by {overdue} day{overdue>1?'s':''}. Remaining {remaining}%.</div>
                  ) : (
                    <>
                      <div className="text-xs flex flex-wrap gap-2">
                        <span className="font-medium">Finish by target:</span>
                        <span>{daysLeft} day{daysLeft>1?'s':''} left</span>
                        <span>• Remaining {remaining}%</span>
                        <span>• Weight {weight}%/day</span>
                      </div>
                      <div className="text-xs mt-1">
                        Daily avg needed with current weight: <span className="font-medium">{reqAvg}%</span>
                        {impossibleWithCurrent && <span className="text-red-500"> (100%/day still not enough)</span>}
                      </div>
                      <div className="text-xs mt-1">
                        Try weight&nbsp;
                        <span className="font-medium">{suggestedW}%</span>
                        &nbsp;<Button size="sm" className="ml-2" onClick={()=>updateGoalWeight(g.id, suggestedW)}>Apply</Button>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={()=> updateGoalWeight(g.id, Math.max(1, (g.dailyWeight ?? 5) - 5))}
                  >
                    -5% weight
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={()=> updateGoalWeight(g.id, Math.min(100, (g.dailyWeight ?? 5) + 5))}
                  >
                    +5% weight
                  </Button>
                  <Button variant="destructive" size="sm" onClick={()=>removeGoal(g.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />Remove
                  </Button>
                </div>
              </div>
            );
          })}
          {goals.length === 0 && <div className="text-xs text-muted-foreground">No goals yet—add one above.</div>}
        </CardContent>
      </Card>

      {/* Morning planner */}
      <Card>
        <CardHeader><CardTitle>Morning plan — pick goals & tasks</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Today’s priorities (top to bottom)</Label>
            {planToday.priorities.length === 0 && <div className="text-xs text-muted-foreground">Pick from “Available goals” below.</div>}
            <div className="space-y-2">
              {planToday.priorities.map((gid, idx) => {
                const g = goals.find(x=>x.id===gid);
                if (!g) return null;
                const daysLeft = daysLeftInclusive(today, g.targetDate);
                const remaining = clamp(100 - g.progress, 0, 100);
                const reqAvgToday = requiredAvgWithCurrentWeight(remaining, daysLeft, g.dailyWeight ?? 5);

                return (
                  <div key={gid} className="flex items-center justify-between p-2 rounded-md border">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{idx + 1}</span>
                      <span className="font-medium">{g.title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground">Target today ≈ {reqAvgToday}% avg</span>
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
              {nonPriorities.map((g) => (
                <Button key={g.id} variant="outline" size="sm" onClick={() => addPriority(g.id)}>{g.title}</Button>
              ))}
              {nonPriorities.length === 0 && (
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

      {/* Focused Session */}
      <FocusPanel dateKey={today} plan={planToday} setPlans={setPlans} />

      {/* End of day — reflect & postpone (auto-saves; tasks auto-carry next day if checked) */}
      <Card>
        <CardHeader><CardTitle>End of day — reflect & postpone</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {todayTasks.some(t=>t.percent<100) && (
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium mb-2">Incomplete today — move to tomorrow?</div>
              <div className="space-y-2">
                {todayTasks.filter(t=>t.percent<100).map(t => {
                  const g = goals.find(x=>x.id===t.goalId);
                  const checked = !!(planToday.postponeFlags && planToday.postponeFlags[t.id]);
                  return (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={(e)=> {
                          const flag = e.target.checked;
                          setPlans(prev => {
                            const cur = prev[today] || { date: today, priorities: [], tasks: [], credits: {}, postponeFlags: {}, focusedCount: 0, focusedSessions: [] };
                            const nextFlags = { ...(cur.postponeFlags || {}) , [t.id]: flag };
                            return { ...prev, [today]: { ...cur, postponeFlags: nextFlags } };
                          });
                        }}
                      />
                      <span className="font-medium">{t.title}</span>
                      <span className="text-xs text-muted-foreground">({g?.title})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reflection inputs (auto-save as you type) */}
          <div><Label>Why weren’t tasks completed?</Label>
            <Textarea
              rows={2}
              value={metaToday.whyNotComplete || ''}
              onChange={(e) => setMetaField('whyNotComplete', e.target.value)}
              placeholder="Be specific—what blocked you?"
            />
          </div>

          <div><Label>Did you really try well?</Label>
            <div className="flex gap-2 mt-1">
              {(['Yes', 'No', 'Neutral'] as const).map((k) => (
                <Button
                  key={k}
                  variant={metaToday.triedWell === k ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMetaField('triedWell', k)}
                >
                  {k}
                </Button>
              ))}
            </div>
          </div>

          <div><Label>How will you improve tomorrow?</Label>
            <Textarea
              rows={2}
              value={metaToday.improve || ''}
              onChange={(e) => setMetaField('improve', e.target.value)}
            />
          </div>

          <div><Label>What did you learn today?</Label>
            <Textarea
              rows={2}
              value={metaToday.learned || ''}
              onChange={(e) => setMetaField('learned', e.target.value)}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Notes auto-saved • Postponed tasks move into tomorrow automatically.
          </div>
        </CardContent>
      </Card>

      {/* History (Calendar) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><HistoryIcon className="h-5 w-5" /> History</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={()=>{
                const d = new Date(calBase); d.setMonth(d.getMonth()-1); d.setDate(1); setCalBase(d);
              }}>{'‹'} Prev</Button>
              <div className="text-sm">{firstOfMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
              <Button variant="outline" size="sm" onClick={()=>{
                const d = new Date(calBase); d.setMonth(d.getMonth()+1); d.setDate(1); setCalBase(d);
              }}>Next {'›'}</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-7 text-xs text-muted-foreground mb-1">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} className="text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthGrid.map(({ iso, inMonth, avg }) => (
              <button
                key={iso}
                disabled={!inMonth}
                onClick={() => { setHistDate(iso); setHistOpen(true); }}
                className={`aspect-square rounded-lg flex items-center justify-center text-sm font-medium
                  ${inMonth ? colorForAvg(avg) : 'bg-muted text-muted-foreground opacity-50 cursor-default'}
                  ${inMonth ? 'hover:opacity-90 transition' : ''}
                `}
                title={avg === null ? `${iso}: no data` : `${iso}: ${avg}%`}
              >
                {new Date(iso).getDate()}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            Legend: <span className="px-2 py-0.5 rounded bg-green-500/80 text-white">>70%</span>{' '}
            <span className="px-2 py-0.5 rounded bg-yellow-400/80 text-black">51–70%</span>{' '}
            <span className="px-2 py-0.5 rounded bg-red-500/80 text-white">≤50%</span>{' '}
            <span className="px-2 py-0.5 rounded bg-muted">no data</span>
          </div>
        </CardContent>
      </Card>

      {/* Day details modal */}
      <Dialog open={histOpen} onOpenChange={(v)=> setHistOpen(v)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Day details — {histDate}</DialogTitle>
          </DialogHeader>
          {histDate && (() => {
            const pl = plans[histDate];
            if (!pl) return <div className="text-xs text-muted-foreground">No plan recorded.</div>;
            const avg = dayAverageFor(histDate);
            const grouped = new Map<string, Task[]>();
            for (const t of pl.tasks) {
              const arr = grouped.get(t.goalId) || [];
              arr.push(t);
              grouped.set(t.goalId, arr);
            }
            return (
              <div className="space-y-4">
                <div className="p-3 rounded-md border">
                  <div className="text-sm font-medium">Summary</div>
                  <div className="text-xs text-muted-foreground">
                    {avg === null ? 'No tasks logged.' : `Average completion: ${avg}%`}
                    {' • '}Focused sessions: {pl.focusedCount ?? 0}
                  </div>
                </div>

                <div className="space-y-3">
                  {[...grouped.entries()].map(([gid, list]) => {
                    const g = goals.find(x=>x.id===gid);
                    const gAvg = list.length ? Math.round(list.reduce((s,t)=>s+t.percent,0)/list.length) : 0;
                    return (
                      <div key={gid} className="p-3 rounded-md border">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{g?.title ?? 'Unknown goal'}</div>
                          <div className="text-xs text-muted-foreground">Avg: {gAvg}%</div>
                        </div>
                        <div className="mt-2 space-y-1">
                          {list.map(t => (
                            <div key={t.id} className="flex items-center justify-between text-sm">
                              <div className="truncate">{t.title}</div>
                              <div className="text-xs text-muted-foreground">{t.percent}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {pl.tasks.length === 0 && <div className="text-xs text-muted-foreground">No tasks.</div>}
                </div>

                <div className="p-3 rounded-md border">
                  <div className="text-sm font-medium mb-1">Focused sessions</div>
                  {(pl.focusedSessions?.length ?? 0) === 0 ? (
                    <div className="text-xs text-muted-foreground">No focused sessions.</div>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-auto">
                      {(pl.focusedSessions ?? []).map(s => (
                        <div key={s.id} className="text-xs flex items-center justify-between">
                          <span>
                            {new Date(s.startISO).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            {' → '}
                            {new Date(s.endISO).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                          </span>
                          <span>{s.status} • {s.durationMin}m • acks: {s.acknowledgedAt.length}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setHistOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* dialogs */}
      <GoalModal open={goalOpen} onOpenChange={setGoalOpen} onSave={addGoal}/>
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
