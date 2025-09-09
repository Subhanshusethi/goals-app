'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Star,
  StarOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

/* ========================
   Types & Helpers
======================== */
type Priority = 'Low' | 'Medium' | 'High';

interface Task {
  title: string;
  progress: number; // 0, 5, 50, 100
}

interface Reflection {
  learned: string;
  improve: string;
  triedWell: 'Yes' | 'No' | 'Maybe';
}

interface Postpone {
  reason: string;
  consequences: string;
}

interface DailyEntry {
  tasks: Task[];
  reflection?: Reflection;
  notDoneReasons?: string;
  postpone?: Postpone;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  progress: number;
  dailyEntries: Record<string, DailyEntry>;
  createdAt: string;
  updatedAt: string;
}

interface DailyMeta {
  date: string;
  priorities: string[]; // goal ids for today's focus
}

const NAME = 'Subhanshu';
const LS_KEY = 'goals_v1';
const LS_META = 'goals_daymeta_v1';

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const yesterdayStr = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const nowTime = (): string => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};
const uid = (): string => Math.random().toString(36).slice(2, 10);
const formatTodayLong = (): string =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const calculateCumulative = (tasks: Task[]): number => {
  if (tasks.length === 0) return 0;
  return tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length;
};

const loadGoals = (): Goal[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return sampleGoals;
    return JSON.parse(raw) as Goal[];
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
   Sample Goals
======================== */
const sampleGoals: Goal[] = [
  {
    id: uid(),
    title: 'Build ML Model Architecture',
    description: 'Develop a machine learning model architecture from scratch.',
    priority: 'High' as const,
    progress: 0,
    dailyEntries: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: uid(),
    title: 'Ship Personal Portfolio',
    description: 'Rebuild and launch personal portfolio website.',
    priority: 'Medium' as const,
    progress: 0,
    dailyEntries: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

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
  const [priority, setPriority] = useState<Priority>(initial?.priority || 'Medium');

  const onSubmit = () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const g: Goal = {
      id: initial?.id || uid(),
      title,
      description,
      priority,
      progress: initial?.progress || 0,
      dailyEntries: initial?.dailyEntries || {},
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    };
    onSave(g);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Goal' : 'New Goal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Goal Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Build ML Model" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the goal." />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v: Priority) => setPriority(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================
   Set Tasks Modal
======================== */
interface TaskSetModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (tasks: Task[]) => void;
}
function TaskSetModal({ open, onOpenChange, onSave }: TaskSetModalProps) {
  const [input, setInput] = useState('');

  const onSubmit = () => {
    const tasks: Task[] = input.split(/[\n,]/).map(t => t.trim()).filter(Boolean).map(title => ({ title, progress: 0 }));
    if (tasks.length === 0) return;
    onSave(tasks);
    onOpenChange(false);
    setInput('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Today's Tasks</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tasks (one per line or comma-separated)</Label>
            <Textarea
              rows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., Create dataset and understanding, Create model architecture by pen, Find similar research papers"
            />
            <p className="text-xs text-muted-foreground mt-1">You can add 1-5 tasks. Progress will start at 0%.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Set Tasks</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================
   Reflect Modal
======================== */
interface ReflectModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (reflection: Reflection, reasons?: string, postpone?: Postpone) => void;
  goalId: string;
  date: string;
  tasks: Task[];
  cumulative: number;
}
function ReflectModal({ open, onOpenChange, onSave, goalId, date, tasks, cumulative }: ReflectModalProps) {
  const [learned, setLearned] = useState('');
  const [improve, setImprove] = useState('');
  const [triedWell, setTriedWell] = useState<'Yes' | 'No' | 'Maybe'>('Maybe');
  const [showReasons, setShowReasons] = useState(cumulative < 50);
  const [reasons, setReasons] = useState('');
  const [postponeChecked, setPostponeChecked] = useState(false);
  const [postReason, setPostReason] = useState('');
  const [consequences, setConsequences] = useState('');

  const isLowProgress = cumulative < 50;
  const requireReasons = isLowProgress;

  const onSubmit = () => {
    if (requireReasons && !reasons.trim()) {
      alert('Please provide reasons for not completing.');
      return;
    }
    if (postponeChecked && (!postReason.trim() || !consequences.trim())) {
      alert('Please fill postpone reason and consequences.');
      return;
    }
    const reflection: Reflection = { learned, improve, triedWell };
    const notDoneReasons = requireReasons ? reasons : undefined;
    const postpone: Postpone | undefined = postponeChecked ? { reason: postReason, consequences } : undefined;
    onSave(reflection, notDoneReasons, postpone);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>End of Day Reflection</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium">Cumulative progress for {date}: {cumulative.toFixed(1)}%</p>
            <Progress value={cumulative} className="mt-2 mx-auto w-1/2" />
          </div>
          <Separator />
          <div>
            <Label>What I learned today</Label>
            <Textarea rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} placeholder="Key insights from today's work..." />
          </div>
          <div>
            <Label>What needs to be better</Label>
            <Textarea rows={2} value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Areas for improvement..." />
          </div>
          <div>
            <Label>Did I try well today?</Label>
            <Select value={triedWell} onValueChange={(v: 'Yes' | 'No' | 'Maybe') => setTriedWell(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="Maybe">Maybe</SelectItem>
                <SelectItem value="No">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isLowProgress && (
            <>
              <Separator />
              <div>
                <Label>Why not completed more? {requireReasons && <span className="text-red-500">*</span>}</Label>
                <Textarea rows={2} value={reasons} onChange={(e) => setReasons(e.target.value)} placeholder="Reasons for low progress..." />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="postpone" checked={postponeChecked} onCheckedChange={(checked) => setPostponeChecked(!!checked)} />
                <Label htmlFor="postpone">Postpone remaining tasks to tomorrow?</Label>
              </div>
              {postponeChecked && (
                <>
                  <div>
                    <Label>Postpone reason</Label>
                    <Textarea rows={2} value={postReason} onChange={(e) => setPostReason(e.target.value)} placeholder="Why postpone..." />
                  </div>
                  <div>
                    <Label>Potential consequences</Label>
                    <Textarea rows={2} value={consequences} onChange={(e) => setConsequences(e.target.value)} placeholder="What could go wrong if postponed..." />
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Complete & Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================
   Goal Card
======================== */
interface GoalCardProps {
  goal: Goal;
  isPriority: boolean;
  onTogglePriority: (id: string) => void;
  onSetTasks: (g: Goal) => void;
  onUpdateTask: (index: number, progress: number) => void;
  onReflect: (date: string) => void;
  today: string;
  entry?: DailyEntry;
}
function GoalCard({ goal, isPriority, onTogglePriority, onSetTasks, onUpdateTask, onReflect, today, entry }: GoalCardProps) {
  const cumulative = entry ? calculateCumulative(entry.tasks) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{goal.title}</CardTitle>
            <Badge variant={goal.priority === 'High' ? 'default' : 'secondary'}>{goal.priority}</Badge>
          </div>
          <div className="space-y-2">
            <Progress value={goal.progress} />
            <p className="text-xs text-muted-foreground">{goal.progress}% overall</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPriority ? (
            <>
              {entry && entry.tasks.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {entry.tasks.map((task, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 bg-muted/50 rounded-md">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{task.title}</p>
                          <Progress value={task.progress} className="mt-1" />
                          <p className="text-xs text-muted-foreground">{task.progress}%</p>
                        </div>
                        <div className="flex gap-1">
                          {[0, 5, 50, 100].map((p) => (
                            <Button
                              key={p}
                              size="sm"
                              variant={task.progress === p ? 'default' : 'outline'}
                              onClick={() => onUpdateTask(index, p)}
                            >
                              {p}%
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-center text-sm text-muted-foreground">
                    Cumulative: {cumulative.toFixed(0)}%
                  </div>
                </>
              ) : (
                <Button variant="outline" onClick={() => onSetTasks(goal)} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Set today's tasks
                </Button>
              )}
              {!entry?.reflection ? (
                <Button onClick={() => onReflect(today)} className="w-full">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Reflect & Complete
                </Button>
              ) : (
                <div className="text-center p-2 bg-green-50 rounded-md text-sm text-green-700">
                  Day completed ✅
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => onTogglePriority(goal.id)} className="w-full">
                <StarOff className="mr-2 h-4 w-4" /> Remove from today
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onTogglePriority(goal.id)} className="w-full">
              <Star className="mr-2 h-4 w-4" /> Focus today
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ========================
   Main App
======================== */
export default function GoalsApp() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [metaByDay, setMetaByDay] = useState<Record<string, DailyMeta>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskGoalId, setTaskGoalId] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [reflectOpen, setReflectOpen] = useState(false);
  const [reflectGoalId, setReflectGoalId] = useState('');
  const [reflectDate, setReflectDate] = useState('');

  const today = todayStr();
  const todayMeta = metaByDay[today] || { date: today, priorities: [] };

  useEffect(() => {
    setGoals(loadGoals());
    setMetaByDay(loadMeta());
  }, []);
  useEffect(() => saveGoals(goals), [goals]);
  useEffect(() => saveMeta(metaByDay), [metaByDay]);

  const addOrUpdateGoal = (goal: Goal) => {
    setGoals((prev) => {
      const exists = prev.find((g) => g.id === goal.id);
      if (exists) {
        return prev.map((g) => (g.id === goal.id ? goal : g));
      }
      return [...prev, goal];
    });
  };

  const updateGoal = (updated: Partial<Goal> & { id: string }) => {
    setGoals((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated, updatedAt: new Date().toISOString() } : g)));
  };

  const deleteGoal = (id: string) => setGoals((prev) => prev.filter((g) => g.id !== id));

  const togglePriority = (goalId: string) => {
    const nextPriorities = todayMeta.priorities.includes(goalId)
      ? todayMeta.priorities.filter((p) => p !== goalId)
      : [...todayMeta.priorities, goalId].slice(0, 3); // Limit to 3
    setMetaByDay((prev) => ({ ...prev, [today]: { ...todayMeta, priorities: nextPriorities } }));
  };

  const handleSetTasksClick = (goal: Goal) => {
    const yest = yesterdayStr();
    const yestEntry = goal.dailyEntries[yest];
    if (yestEntry && !yestEntry.reflection) {
      // Block: Open reflect for yesterday
      setReflectGoalId(goal.id);
      setReflectDate(yest);
      setReflectOpen(true);
      return;
    }
    // Proceed to set tasks for today
    setTaskGoalId(goal.id);
    setTaskDate(today);
    setTaskOpen(true);
  };

  const handleSetTasksSave = (tasks: Task[]) => {
    const goal = goals.find((g) => g.id === taskGoalId);
    if (!goal) return;
    updateGoal({
      id: goal.id,
      dailyEntries: { ...goal.dailyEntries, [taskDate]: { tasks, reflection: undefined } },
    });
  };

  const handleUpdateTask = (index: number, progress: number) => {
    const goal = goals.find((g) => g.id === reflectGoalId || g.id === taskGoalId); // Use current open goal
    if (!goal || !todayMeta.priorities.includes(goal.id)) return;
    const entry = goal.dailyEntries[today];
    if (!entry) return;
    const newTasks = [...entry.tasks];
    newTasks[index].progress = progress;
    updateGoal({
      id: goal.id,
      dailyEntries: { ...goal.dailyEntries, [today]: { ...entry, tasks: newTasks } },
    });
  };

  const handleReflectClick = (date: string) => {
    setReflectDate(date);
    setReflectOpen(true);
  };

  const handleReflectSave = (reflection: Reflection, reasons?: string, postpone?: Postpone) => {
    const goal = goals.find((g) => g.id === reflectGoalId);
    if (!goal) return;
    const entry = goal.dailyEntries[reflectDate];
    if (!entry) return;
    const cumulative = calculateCumulative(entry.tasks);
    const newProgress = Math.min(100, goal.progress + cumulative);
    updateGoal({
      id: goal.id,
      progress: newProgress,
      dailyEntries: {
        ...goal.dailyEntries,
        [reflectDate]: {
          ...entry,
          reflection,
          notDoneReasons: reasons,
          postpone,
        },
      },
    });
  };

  const visibleGoals = useMemo(() => {
    return goals
      .filter((g) => g.progress < 100) // Show incomplete goals
      .sort((a, b) => {
        const prioA = todayMeta.priorities.includes(a.id) ? -1 : { High: 0, Medium: 1, Low: 2 }[a.priority];
        const prioB = todayMeta.priorities.includes(b.id) ? -1 : { High: 0, Medium: 1, Low: 2 }[b.priority];
        return prioA - prioB;
      });
  }, [goals, todayMeta.priorities]);

  const todayPrioritiesTitles = todayMeta.priorities
    .map((id) => goals.find((g) => g.id === id)?.title)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="p-4 border-b bg-gradient-to-r from-primary/5 to-secondary/5">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Good morning, {NAME}!</h1>
          <p className="text-muted-foreground mt-1">{formatTodayLong()}</p>
          {todayPrioritiesTitles && (
            <p className="text-sm text-muted-foreground mt-2">Today's focus: {todayPrioritiesTitles}</p>
          )}
          <div className="mt-4 flex gap-2">
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> New Goal
            </Button>
          </div>
        </div>
      </header>

      {/* Goals */}
      <main className="p-4 max-w-4xl mx-auto">
        <AnimatePresence>
          {visibleGoals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleGoals.map((goal) => {
                const entry = goal.dailyEntries[today];
                const isPriority = todayMeta.priorities.includes(goal.id);
                return (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isPriority={isPriority}
                    onTogglePriority={togglePriority}
                    onSetTasks={handleSetTasksClick}
                    onUpdateTask={handleUpdateTask}
                    onReflect={handleReflectClick}
                    today={today}
                    entry={entry}
                  />
                );
              })}
            </div>
          ) : (
            <Card className="text-center py-12">
              <CardTitle className="text-lg mb-2">No Goals Yet</CardTitle>
              <p className="text-muted-foreground mb-4">Start by creating your first long-term goal.</p>
              <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Create Goal
              </Button>
            </Card>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <GoalModal open={modalOpen} onOpenChange={setModalOpen} onSave={addOrUpdateGoal} initial={editing} />
      <TaskSetModal open={taskOpen} onOpenChange={setTaskOpen} onSave={handleSetTasksSave} />
      <ReflectModal
        open={reflectOpen}
        onOpenChange={setReflectOpen}
        onSave={handleReflectSave}
        goalId={reflectGoalId}
        date={reflectDate}
        tasks={(goals.find((g) => g.id === reflectGoalId)?.dailyEntries[reflectDate]?.tasks || [])}
        cumulative={calculateCumulative(goals.find((g) => g.id === reflectGoalId)?.dailyEntries[reflectDate]?.tasks || [])}
      />
    </div>
  );
}