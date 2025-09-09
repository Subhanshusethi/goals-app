'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Calendar as CalendarIcon,
  CheckCircle2,
  Flame,
  History,
  ListChecks,
  PauseCircle,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
  Trophy,
} from 'lucide-react';
import { XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

/* ========================
   Types & Helpers
======================== */
type Priority = 'Low' | 'Medium' | 'High';
type GoalStatus = 'Active' | 'Paused' | 'Completed' | 'Dropped';
type DailyStatus = 'On Track' | 'At Risk' | 'Off Track';

interface DailyLog {
  date: string;           // YYYY-MM-DD
  time: string;           // HH:mm
  notes: string;
  tags: string[];
  progressDelta: number;
  mood?: string;
  blockers?: string[];
  timeSpentMin?: number;
  status?: DailyStatus;
}

interface PostponeEntry {
  date: string;
  item: 'Goal' | 'Milestone';
  targetId?: string;
  fromDate?: string;
  toDate?: string;
  reason: string;
}

interface FailureEntry {
  date: string;
  what: 'Goal' | 'Milestone';
  targetId?: string;
  reason: string;
  lesson: string;
  retryPlan: string;
}

interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  strategy: string;
  milestones: Milestone[];
  tags: string[];
  priority: Priority;
  status: GoalStatus;
  progress: number;       // 0–100
  unit?: string;          // optional unit for outcome (e.g. "sessions", "km")
  weeklyTarget?: number;  // sessions per week (for cadence)
  dailyLogs: DailyLog[];
  postponements: PostponeEntry[];
  failures: FailureEntry[];
  createdAt: string;
  updatedAt: string;
}

type PostponeTarget = { item: 'Goal' | 'Milestone'; targetId?: string };
type PostponeEventDetail = { goalId: string; item: 'Goal' | 'Milestone'; targetId?: string; currentDate?: string };

interface DailyMeta {
  date: string;                    // YYYY-MM-DD
  priorities: string[];            // chosen at start of day
  eodStatus?: 'Done' | 'At Risk' | 'Missed';
  reflection?: string;
}

const LS_KEY = 'goals_v1';
const LS_META = 'goals_daymeta_v1';

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const nowTime = (): string => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const daysBetween = (a: string | Date, b: string | Date): number =>
  Math.round((+new Date(b) - +new Date(a)) / (1000 * 60 * 60 * 24));

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);
const uid = (): string => Math.random().toString(36).slice(2, 10);

const formatTodayLong = (): string =>
  new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/* ========================
   Sample & Storage
======================== */
const sampleGoals: Goal[] = [
  {
    id: uid(),
    title: 'Run a Half Marathon',
    description: 'Train 4x/week and finish under 2h.',
    startDate: todayStr(),
    endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10),
    strategy: 'Follow a 12-week plan. Long runs on Sundays. Strength x2/week.',
    milestones: [
      { id: uid(), title: '5K under 28m', dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10), done: false },
      { id: uid(), title: '10K under 60m', dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 35).toISOString().slice(0, 10), done: false },
    ],
    tags: ['fitness'],
    priority: 'High',
    status: 'Active',
    progress: 20,
    unit: 'sessions',
    weeklyTarget: 4,
    dailyLogs: [
      { date: todayStr(), time: nowTime(), notes: '3km easy jog', tags: ['Workout'], progressDelta: 2, mood: '🙂', timeSpentMin: 25, status: 'On Track' },
    ],
    postponements: [],
    failures: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: uid(),
    title: 'Ship Personal Portfolio',
    description: 'Rebuild portfolio with Next.js & animations.',
    startDate: todayStr(),
    endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
    strategy: 'Design in Figma, iterate quickly. Launch v1 public.',
    milestones: [
      { id: uid(), title: 'Figma draft', dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10), done: true },
      { id: uid(), title: 'v1 Live', dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25).toISOString().slice(0, 10), done: false },
    ],
    tags: ['career', 'dev'],
    priority: 'Medium',
    status: 'Active',
    progress: 45,
    unit: 'sessions',
    weeklyTarget: 5,
    dailyLogs: [],
    postponements: [],
    failures: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const loadGoals = (): Goal[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return sampleGoals;
    const parsed = JSON.parse(raw) as Goal[];
    // backfill new optional fields
    return parsed.map((g) => ({ unit: 'sessions', weeklyTarget: 3, ...g }));
  } catch {
    return sampleGoals;
  }
};
const saveGoals = (goals: Goal[]): void => localStorage.setItem(LS_KEY, JSON.stringify(goals));

const loadMeta = (): Record<string, DailyMeta> => {
  try {
    const raw = localStorage.getItem(LS_META);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DailyMeta>;
  } catch {
    return {};
  }
};
const saveMeta = (meta: Record<string, DailyMeta>) => localStorage.setItem(LS_META, JSON.stringify(meta));

/* ========================
   Small UI bits
======================== */
const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full bg-muted text-xs">{children}</span>
);

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <div className="space-y-2">
    <Label className="text-sm text-muted-foreground">{label}</Label>
    {children}
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

const Empty: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  cta?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, cta }) => (
  <div className="flex flex-col items-center text-center py-10 gap-3">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <p className="font-medium">{title}</p>
    <p className="text-sm text-muted-foreground max-w-md">{subtitle}</p>
    {cta}
  </div>
);

/* ========================
   Add / Edit Goal Modal
======================== */
interface GoalModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (g: Goal) => void;
  initial?: Goal | null;
}
function GoalModal({ open, onOpenChange, onSave, initial }: GoalModalProps) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [strategy, setStrategy] = useState(initial?.strategy || '');
  const [startDate, setStartDate] = useState(initial?.startDate || todayStr());
  const [endDate, setEndDate] = useState(initial?.endDate || todayStr());
  const [priority, setPriority] = useState<Priority>(initial?.priority || 'Medium');
  const [tags, setTags] = useState((initial?.tags || []).join(', '));
  const [unit, setUnit] = useState<string>(initial?.unit || 'sessions');
  const [weeklyTarget, setWeeklyTarget] = useState<number>(initial?.weeklyTarget ?? 3);

  const onSubmit = () => {
    const now = new Date().toISOString();
    const g: Goal = {
      id: initial?.id || uid(),
      title,
      description,
      startDate,
      endDate,
      strategy,
      milestones: initial?.milestones || [],
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      priority,
      status: initial?.status || 'Active',
      progress: initial?.progress ?? 0,
      unit,
      weeklyTarget,
      dailyLogs: initial?.dailyLogs || [],
      postponements: initial?.postponements || [],
      failures: initial?.failures || [],
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    };
    onSave(g);
    onOpenChange(false);
  };

  useEffect(() => {
    if (open && !initial) {
      setStartDate(todayStr());
      setEndDate(todayStr());
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit goal' : 'Create a new goal'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Goal title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Run a half marathon" />
          </Field>
          <Field label="Priority">
            <Select value={priority} onValueChange={(v: Priority) => setPriority(v)}>
              <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="How I'll achieve it" hint="High-level approach, routines, systems">
            <Textarea rows={3} value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Follow a 12-week plan, long runs on Sunday..." />
          </Field>
          <Field label="Tags" hint="Comma separated">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="fitness, learning" />
          </Field>
          <Field label="Outcome unit (optional)">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sessions, km, pages…" />
          </Field>
          <Field label="Weekly target (cadence)">
            <Input type="number" value={weeklyTarget} onChange={(e) => setWeeklyTarget(Number(e.target.value || 0))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does success look like?" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}><CheckCircle2 className="mr-2 h-4 w-4" />Save goal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================
   Postpone & Failure Dialogs
======================== */
interface PostponeDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (d: { toDate: string; reason: string }) => void;
  target: PostponeTarget | null;
  defaultDate?: string;
}
function PostponeDialog({ open, onOpenChange, onSave, target, defaultDate }: PostponeDialogProps) {
  const [toDate, setToDate] = useState(defaultDate || todayStr());
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Postpone {target?.item.toLowerCase()}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="New date"><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
          <Field label="Why are you postponing?" hint="Be honest. Capture the reason—no judgment">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Busy at work, under the weather, missing dependency..." />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave({ toDate, reason }); onOpenChange(false); }}>
            <ArrowUpRight className="mr-2 h-4 w-4" />Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FailureDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (d: { reason: string; lesson: string; retryPlan: string }) => void;
  target?: PostponeTarget | null;
}
function FailureDialog({ open, onOpenChange, onSave }: FailureDialogProps) {
  const [reason, setReason] = useState('');
  const [lesson, setLesson] = useState('');
  const [retryPlan, setRetryPlan] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Not achieved — log it</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="What happened?"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Didn't finish because..." /></Field>
          <Field label="What did I learn?"><Textarea rows={2} value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Next time I'll..." /></Field>
          <Field label="Retry plan"><Textarea rows={2} value={retryPlan} onChange={(e) => setRetryPlan(e.target.value)} placeholder="Concrete next steps" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave({ reason, lesson, retryPlan }); onOpenChange(false); }}>
            <CheckCircle2 className="mr-2 h-4 w-4" />Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================
   Goal Detail Drawer
======================== */
interface GoalDrawerProps {
  goal: Goal | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdate: (g: Goal) => void;
  onDelete: (id: string) => void;
  onQuickLog: (goalId: string, logPartial: Partial<DailyLog>) => void;
}
function GoalDrawer({ goal, open, onOpenChange, onUpdate, onDelete, onQuickLog }: GoalDrawerProps) {
  const { cumulative, daysLeft, nextMilestone } = useMemo(() => {
    if (!goal) return { cumulative: [] as { date: string; progress: number }[], daysLeft: 0, nextMilestone: undefined as Milestone | undefined };
    let sum = 0;
    const logs = goal.dailyLogs ?? [];
    const sorted = [...logs].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const cumulativeData = sorted.map((l) => {
      sum = clamp(sum + (l.progressDelta || 0), 0, 100);
      return { date: l.date.slice(5), progress: sum };
    });
    return {
      cumulative: cumulativeData,
      daysLeft: daysBetween(todayStr(), goal.endDate || todayStr()),
      nextMilestone: goal.milestones?.find((m) => !m.done),
    };
  }, [goal]);

  if (!goal) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DrawerTitle className="text-xl">{goal.title}</DrawerTitle>
              <DrawerDescription className="flex gap-2 mt-1">
                <Chip><CalendarIcon className="h-3.5 w-3.5 inline mr-1" />{goal.startDate} → {goal.endDate}</Chip>
                <Chip>Priority: {goal.priority}</Chip>
                <Chip>Status: {goal.status}</Chip>
                {goal.weeklyTarget ? <Chip>Weekly: {goal.weeklyTarget} {goal.unit || 'sessions'}</Chip> : null}
                {goal.tags?.map((t) => (
                  <Badge key={t} variant="secondary" className="ml-1">#{t}</Badge>
                ))}
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onUpdate({ ...goal, status: goal.status === 'Paused' ? 'Active' : 'Paused' })}>
                {goal.status === 'Paused' ? <PlayIcon /> : <PauseCircle className="mr-2 h-4 w-4" />}
                {goal.status === 'Paused' ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="destructive" onClick={() => onDelete(goal.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground mb-1">Overall progress</div>
                  <Progress value={goal.progress} />
                  <div className="text-xs text-muted-foreground mt-1">
                    {goal.progress}% • {daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days past deadline`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">{consistencyScore(goal)}%</div>
                  <div className="text-xs text-muted-foreground">Consistency score</div>
                </div>
              </div>
              <div className="h-40 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulative} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} hide />
                    <RTooltip />
                    <Area dataKey="progress" stroke="hsl(var(--primary))" fill="url(#grad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />Next Milestone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {nextMilestone ? (
                <>
                  <div className="text-sm font-medium">{nextMilestone.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" />Due {nextMilestone.dueDate}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => onQuickLog(goal.id, { notes: `Worked toward: ${nextMilestone.title}`, progressDelta: 2, status: 'On Track', tags: ['Milestone'] })}>
                      <Timer className="mr-2 h-4 w-4" />Quick log
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const ev = new CustomEvent<PostponeEventDetail>('open-postpone', { detail: { goalId: goal.id, item: 'Milestone', targetId: nextMilestone.id, currentDate: nextMilestone.dueDate } });
                        window.dispatchEvent(ev);
                      }}
                    >
                      <History className="mr-2 h-4 w-4" />Postpone
                    </Button>
                  </div>
                </>
              ) : (
                <Empty icon={Trophy} title="No pending milestone" subtitle="Celebrate! Or add the next one below." />
              )}
              <Separator />
              <MilestonesEditor goal={goal} onUpdate={onUpdate} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Timeline</CardTitle></CardHeader>
            <CardContent><Timeline goal={goal} /></CardContent>
          </Card>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PlayIcon() {
  return <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>;
}

const MilestonesEditor: React.FC<{ goal: Goal; onUpdate: (g: Goal) => void }> = ({ goal, onUpdate }) => {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(todayStr());
  const add = () => {
    if (!title.trim()) return;
    const ms = [...goal.milestones, { id: uid(), title, dueDate: due, done: false }];
    onUpdate({ ...goal, milestones: ms, updatedAt: new Date().toISOString() });
    setTitle('');
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add milestone" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
        <Button onClick={add}><Plus className="mr-2 h-4 w-4" />Add</Button>
      </div>
      <div className="space-y-2">
        {goal.milestones.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-2 rounded-lg border">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={m.done}
                onChange={(e) => {
                  const ms = goal.milestones.map((x) => (x.id === m.id ? { ...x, done: e.target.checked } : x));
                  onUpdate({ ...goal, milestones: ms, updatedAt: new Date().toISOString() });
                }}
              />
              <div>
                <div className="text-sm font-medium">{m.title}</div>
                <div className="text-xs text-muted-foreground">Due {m.dueDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const ev = new CustomEvent<PostponeEventDetail>('open-postpone', { detail: { goalId: goal.id, item: 'Milestone', targetId: m.id, currentDate: m.dueDate } });
                  window.dispatchEvent(ev);
                }}
              ><History className="h-4 w-4" /></Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  const ms = goal.milestones.filter((x) => x.id !== m.id);
                  onUpdate({ ...goal, milestones: ms, updatedAt: new Date().toISOString() });
                }}
              ><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Timeline: React.FC<{ goal: Goal }> = ({ goal }) => {
  const items = [
    ...goal.postponements.map((p) => ({ type: 'postpone' as const, date: p.date, label: `Postponed ${p.item.toLowerCase()} → ${p.toDate}`, detail: p.reason })),
    ...goal.failures.map((f) => ({ type: 'failure' as const, date: f.date, label: `Not achieved: ${f.what.toLowerCase()}`, detail: `Why: ${f.reason}. Lesson: ${f.lesson}. Retry: ${f.retryPlan}` })),
    ...goal.dailyLogs.map((l) => ({ type: 'log' as const, date: `${l.date} ${l.time}`, label: `+${l.progressDelta}% ${l.tags?.[0] ? `• ${l.tags[0]}` : ''}`, detail: l.notes })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (!items.length) return <Empty icon={History} title="No history yet" subtitle="Start with a daily check-in to build momentum." />;

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[140px_1fr] gap-3 items-start">
          <div className="text-xs text-muted-foreground">{it.date}</div>
          <div className="p-3 rounded-lg border flex items-start gap-3">
            {it.type === 'postpone' && <History className="h-4 w-4 mt-0.5" />}
            {it.type === 'failure' && <AlertCircle className="h-4 w-4 mt-0.5" />}
            {it.type === 'log' && <Timer className="h-4 w-4 mt-0.5" />}
            <div>
              <div className="text-sm font-medium">{it.label}</div>
              <div className="text-xs text-muted-foreground">{it.detail}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ========================
   Daily Quick Log (Sticky Today bar)
======================== */
const QUICK_TAGS = ['Deep work', 'Study', 'Workout', 'Review', 'Planning', 'Focus'];

const TodayBar: React.FC<{
  goals: Goal[];
  onQuickLog: (goalId: string, log: Partial<DailyLog>) => void;
  meta: DailyMeta | undefined;
  onMetaChange: (next: DailyMeta) => void;
}> = ({ goals, onQuickLog, meta, onMetaChange }) => {
  const [goalId, setGoalId] = useState(goals[0]?.id || '');
  const [delta, setDelta] = useState<number>(1);
  const [mood, setMood] = useState('🙂');
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => { if (goals.length && !goalId) setGoalId(goals[0].id); }, [goals, goalId]);

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const save = () => {
    if (!goalId) return;
    onQuickLog(goalId, {
      date: todayStr(),
      time: nowTime(),
      progressDelta: delta,
      notes,
      tags,
      mood,
      status: 'On Track',
    });
    // reset minimal fields, keep last mood/tags if you prefer
    setNotes('');
  };

  // Start/End of Day quick flows
  const priorities = meta?.priorities ?? [];
  const setPriority = (p: string) => {
    const exists = priorities.includes(p);
    const next = exists ? priorities.filter((x) => x !== p) : [...priorities, p].slice(0, 3);
    onMetaChange({ date: todayStr(), priorities: next, eodStatus: meta?.eodStatus, reflection: meta?.reflection });
  };

  return (
    <div className="sticky top-0 z-50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">📅 Today — {formatTodayLong()}</div>
          <div className="text-xs text-muted-foreground">Tap-in fast — no typing needed</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-2">
          {/* Quick composer */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select goal" /></SelectTrigger>
              <SelectContent>{goals.map((g) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setDelta((d) => Math.max(0, d - 1))}>−1%</Button>
              <Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value || 0))} className="w-16 text-center" />
              <Button size="sm" variant="outline" onClick={() => setDelta((d) => d + 1)}>+1%</Button>
              <Button size="sm" variant="outline" onClick={() => setDelta(2)}>+2%</Button>
              <Button size="sm" variant="outline" onClick={() => setDelta(5)}>+5%</Button>
            </div>
            <Select value={mood} onValueChange={setMood}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{['😀', '🙂', '😐', '😕', '😫'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {QUICK_TAGS.map((t) => (
              <Button key={t} size="sm" variant={tags.includes(t) ? 'default' : 'secondary'} onClick={() => toggleTag(t)}>
                {t}
              </Button>
            ))}
          </div>

          <div className="lg:justify-self-end lg:col-start-auto">
            <Input placeholder="(Optional) short note…" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full lg:w-72" />
          </div>

          <div className="lg:justify-self-end">
            <Button onClick={save}><CheckCircle2 className="mr-2 h-4 w-4" />Save log</Button>
          </div>
        </div>

        {/* Start of Day: pick 1–3 priorities */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Today’s priorities:</span>
          {['Deep work', 'Workout', 'Study', 'Build', 'Read', 'Admin'].map((p) => (
            <Button
              key={p}
              size="sm"
              variant={priorities.includes(p) ? 'default' : 'outline'}
              onClick={() => setPriority(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ========================
   Today Timeline (all goals)
======================== */
const TodayTimeline: React.FC<{ goals: Goal[] }> = ({ goals }) => {
  const today = todayStr();
  const items = goals.flatMap((g) =>
    g.dailyLogs
      .filter((l) => l.date === today)
      .map((l) => ({
        time: l.time,
        goal: g.title,
        label: `+${l.progressDelta}% ${l.tags?.[0] ? `• ${l.tags[0]}` : ''}`,
        notes: l.notes,
      })),
  ).sort((a, b) => b.time.localeCompare(a.time));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" />Today’s Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <Empty icon={Timer} title="No logs yet" subtitle="Tap 'Save log' above to record your first micro-log." />
        ) : (
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[64px_1fr] gap-3 items-start p-2 rounded-md border">
                <div className="text-xs text-muted-foreground">{it.time}</div>
                <div>
                  <div className="text-sm"><span className="font-medium">{it.goal}</span> — {it.label}</div>
                  {it.notes ? <div className="text-xs text-muted-foreground">{it.notes}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ========================
   Weekly compliance view
======================== */
const ThisWeek: React.FC<{ goals: Goal[] }> = ({ goals }) => {
  const end = new Date();
  const start = new Date(); start.setDate(end.getDate() - 6); // last 7 days (inclusive)
  const startStr = start.toISOString().slice(0, 10);
  const endStr = todayStr();

  const rows = goals.map((g) => {
    const logs = g.dailyLogs.filter((l) => l.date >= startStr && l.date <= endStr);
    const sessions = logs.length;
    const target = g.weeklyTarget ?? 0;
    const pct = target > 0 ? Math.min(100, Math.round((sessions / target) * 100)) : 0;
    return { id: g.id, title: g.title, sessions, target, pct };
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />This Week</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <div className="text-sm text-muted-foreground">No goals yet.</div> : null}
        {rows.map((r) => (
          <div key={r.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium truncate">{r.title}</div>
              <div className="text-xs text-muted-foreground">{r.sessions}/{r.target || 0} sessions</div>
            </div>
            <Progress value={r.pct} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

/* ========================
   Daily Check-in (kept)
======================== */
const DailyCheckIn: React.FC<{ goals: Goal[]; onSubmit: (goalId: string, logPartial: Partial<DailyLog>) => void }> = ({ goals, onSubmit }) => {
  const [goalId, setGoalId] = useState(goals[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(1);
  const [timeSpent, setTimeSpent] = useState(25);
  const [status, setStatus] = useState<DailyStatus>('On Track');
  const [blockers, setBlockers] = useState('');
  const [mood, setMood] = useState('🙂');

  useEffect(() => { if (goals.length) setGoalId(goals[0].id); }, [goals]);

  const quicks = ['Deep work', 'Study session', 'Workout', 'Planning', 'Review'];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" />Daily Tap-In (full)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Goal">
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger><SelectValue placeholder="Select goal" /></SelectTrigger>
              <SelectContent>{goals.map((g) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Progress delta (%)" hint="Small increments compound">
            <Input type="number" value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
          </Field>
          <Field label="Time spent (min)"><Input type="number" value={timeSpent} onChange={(e) => setTimeSpent(Number(e.target.value))} /></Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Status">
            <Select value={status} onValueChange={(v: DailyStatus) => setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="On Track">On Track</SelectItem>
                <SelectItem value="At Risk">At Risk</SelectItem>
                <SelectItem value="Off Track">Off Track</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mood">
            <Select value={mood} onValueChange={setMood}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['😀', '🙂', '😐', '😕', '😫'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Quick activity tags">
            <div className="flex flex-wrap gap-2">
              {quicks.map((q) => <Button key={q} type="button" variant="secondary" size="sm" onClick={() => setNotes((n) => (n ? n + '; ' : '') + q)}>{q}</Button>)}
            </div>
          </Field>
        </div>
        <Field label="What did you do? Any blockers?">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Short notes..." />
        </Field>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Logging for <strong>{todayStr()} {nowTime()}</strong></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setNotes(''); setProgress(1); setTimeSpent(25); setStatus('On Track'); setMood('🙂'); setBlockers(''); }}>
              <RotateCcw className="mr-2 h-4 w-4" />Reset
            </Button>
            <Button
              onClick={() =>
                onSubmit(goalId, {
                  date: todayStr(),
                  time: nowTime(),
                  notes,
                  progressDelta: Number(progress),
                  timeSpentMin: Number(timeSpent),
                  status,
                  mood,
                  tags: [],
                  blockers: blockers ? blockers.split(',').map((s) => s.trim()) : [],
                })
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />Save today
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/* ========================
   Goal Card & Metrics
======================== */
const GoalCard: React.FC<{
  goal: Goal;
  onOpen: (g: Goal) => void;
  onQuickLog: (goalId: string, logPartial: Partial<DailyLog>) => void;
  onPostpone: (g: Goal) => void;
  onFailure: (g: Goal) => void;
}> = ({ goal, onOpen, onQuickLog, onPostpone, onFailure }) => {
  const daysLeft = daysBetween(todayStr(), goal.endDate);
  const dueTone = daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-muted-foreground';
  const nextMilestone = goal.milestones.find((m) => !m.done);
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="hover:shadow-md transition-all cursor-pointer" onClick={() => onOpen(goal)}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold">{goal.title}</CardTitle>
            <Badge variant={goal.priority === 'High' ? 'default' : 'secondary'}>{goal.priority}</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" /> {goal.startDate} → {goal.endDate} •{' '}
            <span className={dueTone}>{daysLeft >= 0 ? `${daysLeft}d left` : `${Math.abs(daysLeft)}d late`}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1"><span>Progress</span><span>{goal.progress}%</span></div>
            <Progress value={goal.progress} />
          </div>
          {nextMilestone ? (
            <div className="flex items-center justify-between text-xs">
              <div className="truncate"><ListChecks className="h-3.5 w-3.5 inline mr-1" />Next: {nextMilestone.title}</div>
              <div className="text-muted-foreground">Due {nextMilestone.dueDate}</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No milestones pending</div>
          )}
          <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="secondary" onClick={() => onQuickLog(goal.id, { date: todayStr(), time: nowTime(), notes: 'Quick progress', progressDelta: 1, status: 'On Track', tags: ['Tap-in'] })}>
              <Timer className="mr-2 h-4 w-4" />Tap-in
            </Button>
            <Button size="sm" variant="outline" onClick={() => onPostpone(goal)}><History className="mr-2 h-4 w-4" />Postpone</Button>
            <Button size="sm" variant="outline" onClick={() => onFailure(goal)}><AlertCircle className="mr-2 h-4 w-4" />Not achieved</Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const streakCount = (goals: Goal[]): number => {
  const dates = new Set<string>();
  goals.forEach((g) => g.dailyLogs.forEach((l) => dates.add(l.date)));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
};

const consistencyScore = (goal: Goal): number => {
  const totalDays = Math.max(1, daysBetween(goal.startDate, todayStr()));
  const activeDays = new Set(goal.dailyLogs.map((l) => l.date)).size;
  return Math.round((activeDays / totalDays) * 100);
};

/* ========================
   Main App
======================== */
interface PostponeState { open: boolean; target: PostponeTarget | null; goal: Goal | null; currentDate: string; }
interface FailureState { open: boolean; target: PostponeTarget | null; goal: Goal | null; }

export default function GoalsApp() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [metaByDay, setMetaByDay] = useState<Record<string, DailyMeta>>({});
  const today = todayStr();
  const todayMeta = metaByDay[today];

  const [filter, setFilter] = useState<GoalStatus | 'All'>('Active');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [drawerGoal, setDrawerGoal] = useState<Goal | null>(null);

  const [postponeState, setPostponeState] = useState<PostponeState>({ open: false, target: null, goal: null, currentDate: today });
  const [failureState, setFailureState] = useState<FailureState>({ open: false, target: null, goal: null });

  useEffect(() => { setGoals(loadGoals()); setMetaByDay(loadMeta()); }, []);
  useEffect(() => { saveGoals(goals); }, [goals]);
  useEffect(() => { saveMeta(metaByDay); }, [metaByDay]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { goalId, item, targetId, currentDate } = (e as CustomEvent<PostponeEventDetail>).detail;
      const g = goals.find((x) => x.id === goalId);
      if (!g) return;
      setPostponeState({ open: true, target: { item, targetId }, goal: g, currentDate: currentDate || today });
    };
    window.addEventListener('open-postpone', handler as EventListener);
    return () => window.removeEventListener('open-postpone', handler as EventListener);
  }, [goals, today]);

  const addOrUpdate = (goal: Goal) => {
    setGoals((prev) => {
      const exists = prev.some((g) => g.id === goal.id);
      return exists ? prev.map((g) => (g.id === goal.id ? goal : g)) : [goal, ...prev];
    });
  };
  const updateGoal = (goal: Goal) => setGoals((prev) => prev.map((g) => (g.id === goal.id ? goal : g)));
  const deleteGoal = (id: string) => setGoals((prev) => prev.filter((g) => g.id !== id));

  const handleSubmitLog = (goalId: string, logPartial: Partial<DailyLog>) => {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const log: DailyLog = {
          date: today,
          time: nowTime(),
          notes: '',
          tags: [],
          progressDelta: 0,
          ...logPartial,
        };
        const progress = clamp((g.progress || 0) + (log.progressDelta || 0), 0, 100);
        return { ...g, progress, dailyLogs: [...g.dailyLogs, log], updatedAt: new Date().toISOString() };
      }),
    );
  };
  const handleQuickLog = (goalId: string, logPartial: Partial<DailyLog>) => handleSubmitLog(goalId, logPartial);

  const setTodayMeta = (next: DailyMeta) => setMetaByDay((m) => ({ ...m, [today]: next }));

  const visibleGoals = useMemo(() => {
    return goals
      .filter((g) => (filter === 'All' ? true : g.status === filter))
      .filter((g) => g.title.toLowerCase().includes(query.toLowerCase()) || g.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase())))
      .sort(
        (a, b) =>
          (a.priority === 'High' ? 0 : a.priority === 'Medium' ? 1 : 2) -
          (b.priority === 'High' ? 0 : b.priority === 'Medium' ? 1 : 2),
      );
  }, [goals, filter, query]);

  const handlePostponeSave = ({ toDate, reason }: { toDate: string; reason: string }) => {
    const g = postponeState.goal;
    if (!g) return;
    const now = new Date().toISOString();
    if (postponeState.target?.item === 'Goal') {
      updateGoal({ ...g, endDate: toDate, postponements: [...g.postponements, { date: today, item: 'Goal', fromDate: g.endDate, toDate, reason }], updatedAt: now });
    } else if (postponeState.target?.item === 'Milestone') {
      const ms = g.milestones.map((m) => (m.id === postponeState.target?.targetId ? { ...m, dueDate: toDate } : m));
      updateGoal({
        ...g,
        milestones: ms,
        postponements: [...g.postponements, { date: today, item: 'Milestone', targetId: postponeState.target?.targetId, fromDate: postponeState.currentDate, toDate, reason }],
        updatedAt: now,
      });
    }
  };

  const handleFailureSave = ({ reason, lesson, retryPlan }: { reason: string; lesson: string; retryPlan: string }) => {
    const g = failureState.goal;
    if (!g) return;
    const now = new Date().toISOString();
    updateGoal({
      ...g,
      failures: [...g.failures, { date: today, what: failureState.target?.item || 'Goal', targetId: failureState.target?.targetId, reason, lesson, retryPlan }],
      updatedAt: now,
    });
  };

  const totalProgress = Math.round(goals.reduce((s, g) => s + g.progress, 0) / Math.max(1, goals.length));
  const activeCount = goals.filter((g) => g.status === 'Active').length;
  const myStreak = streakCount(goals);

  return (
    <div className="p-0 md:p-0">
      {/* Sticky Today bar with quick composer & priorities */}
      <TodayBar goals={goals.filter((g) => g.status === 'Active')} onQuickLog={handleQuickLog} meta={todayMeta} onMetaChange={setTodayMeta} />

      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Daily Goals</h1>
            <div className="text-sm text-muted-foreground">Make it a routine—not a task.</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> New goal
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(goals, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `goals-${today}.json`; a.click(); URL.revokeObjectURL(url);
              }}
            >
              <History className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div><div className="text-xs text-muted-foreground">Avg progress</div><div className="text-2xl font-semibold">{totalProgress}%</div></div>
              <BarChart3 className="h-6 w-6" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div><div className="text-xs text-muted-foreground">Active goals</div><div className="text-2xl font-semibold">{activeCount}</div></div>
              <ListChecks className="h-6 w-6" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div><div className="text-xs text-muted-foreground">Streak</div><div className="text-2xl font-semibold flex items-center gap-2">{myStreak} <Flame className="h-6 w-6 text-orange-500" /></div></div>
            </CardContent>
          </Card>
        </div>

        {/* Today timeline */}
        <TodayTimeline goals={goals} />

        {/* Weekly compliance */}
        <ThisWeek goals={goals} />

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as GoalStatus | 'All')} className="w-full md:w-auto">
            <TabsList>{['Active', 'Paused', 'Completed', 'Dropped', 'All'].map((f) => <TabsTrigger key={f} value={f}>{f}</TabsTrigger>)}</TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Input placeholder="Search title or #tag" value={query} onChange={(e) => setQuery(e.target.value)} className="w-60" />
          </div>
        </div>

        {/* Goals grid */}
        {goals.length ? (
          visibleGoals.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {visibleGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    onOpen={setDrawerGoal}
                    onQuickLog={handleQuickLog}
                    onPostpone={(goal) => setPostponeState({ open: true, goal, target: { item: 'Goal' }, currentDate: goal.endDate })}
                    onFailure={(goal) => setFailureState({ open: true, goal, target: { item: 'Goal' } })}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <Empty icon={ListChecks} title="No results" subtitle="Try another filter or search." />
          )
        ) : (
          <Empty
            icon={ListChecks}
            title="No goals yet"
            subtitle="Create your first goal to get started."
            cta={<Button onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="mr-2 h-4 w-4" />New goal</Button>}
          />
        )}

        {/* Full Daily Check-in (optional, kept) */}
        <DailyCheckIn goals={goals.filter((g) => g.status === 'Active')} onSubmit={handleSubmitLog} />

        {/* End-of-Day quick reflection */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />End of Day</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(['Done', 'At Risk', 'Missed'] as const).map((k) => (
                <Button
                  key={k}
                  variant={todayMeta?.eodStatus === k ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTodayMeta({ date: today, priorities: todayMeta?.priorities ?? [], eodStatus: k, reflection: todayMeta?.reflection ?? '' })}
                >
                  {k}
                </Button>
              ))}
            </div>
            <Field label="Reflection (optional)">
              <Textarea
                rows={2}
                value={todayMeta?.reflection ?? ''}
                onChange={(e) => setTodayMeta({ date: today, priorities: todayMeta?.priorities ?? [], eodStatus: todayMeta?.eodStatus, reflection: e.target.value })}
                placeholder="One or two lines to close the loop."
              />
            </Field>
          </CardContent>
        </Card>

        {/* Modals & Drawers */}
        <GoalModal open={modalOpen} onOpenChange={setModalOpen} onSave={addOrUpdate} initial={editing} />

        <GoalDrawer
          goal={drawerGoal}
          open={!!drawerGoal}
          onOpenChange={(v) => !v && setDrawerGoal(null)}
          onUpdate={updateGoal}
          onDelete={(id) => { deleteGoal(id); setDrawerGoal(null); }}
          onQuickLog={handleQuickLog}
        />

        <PostponeDialog open={postponeState.open} onOpenChange={(v) => setPostponeState((s) => ({ ...s, open: v }))} onSave={handlePostponeSave} target={postponeState.target} defaultDate={postponeState.currentDate} />
        <FailureDialog open={failureState.open} onOpenChange={(v) => setFailureState((s) => ({ ...s, open: v }))} onSave={handleFailureSave} target={failureState.target} />
      </div>
    </div>
  );
}
