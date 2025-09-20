"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { requireAuth, requireDb } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

// Minimal daily journaling app, now with:
// - Long-term goals (3/6 months)
// - Link today’s entry to goals
// - Simple habit tracker + streaks
// - Weekly/Monthly reflections
// - Basic analytics calendar

type JournalEntry = {
  date: string; // YYYY-MM-DD
  lack?: string;
  improve?: string;
  linkedGoals?: string[];
  completedHabits?: Record<string, boolean>;
  updatedAt?: string;
};

type LTGoal = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  progress?: number; // 0..100
  createdAt?: string;
  updatedAt?: string;
};

type Habit = {
  id: string;
  name: string;
  createdAt?: string;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthKey = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const weekStartKey = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  const wd = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - wd);
  return d.toISOString().slice(0, 10);
};

export default function JournalApp() {
  const auth = requireAuth();
  const db = requireDb();

  // Wait until user is present (Page already guards, but be safe)
  const user = auth.currentUser;
  const [dateKey, setDateKey] = useState<string>(todayStr());
  const [lack, setLack] = useState("");
  const [improve, setImprove] = useState("");
  const [linkedGoals, setLinkedGoals] = useState<string[]>([]);
  const [completedHabits, setCompletedHabits] = useState<Record<string, boolean>>({});
  const [loadedKey, setLoadedKey] = useState<string>("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  // Long-term goals & habits
  const [goals, setGoals] = useState<LTGoal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);

  // New goal / habit inputs
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDue, setNewGoalDue] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newHabitName, setNewHabitName] = useState("");

  // Reflections (weekly / monthly)
  const [weekNote, setWeekNote] = useState("");
  const [monthNote, setMonthNote] = useState("");
  const [loadedWeekKey, setLoadedWeekKey] = useState("");
  const [loadedMonthKey, setLoadedMonthKey] = useState("");

  // Analytics / calendar
  const [calBase, setCalBase] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const calYear = calBase.getFullYear();
  const calMonth = calBase.getMonth();
  const firstOfMonth = new Date(calYear, calMonth, 1);
  const lastOfMonth = new Date(calYear, calMonth + 1, 0);
  const [monthEntries, setMonthEntries] = useState<Record<string, boolean>>({});
  const [journalStreak, setJournalStreak] = useState(0);
  const [habitStreaks, setHabitStreaks] = useState<Record<string, number>>({});

  // Load entry for selected date
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "journal", dateKey);
    getDoc(ref)
      .then((snap) => {
        const data = snap.data() as JournalEntry | undefined;
        setLack(data?.lack ?? "");
        setImprove(data?.improve ?? "");
        setLinkedGoals(data?.linkedGoals ?? []);
        setCompletedHabits(data?.completedHabits ?? {});
        setLoadedKey(dateKey);
        setSaving("idle");
      })
      .catch(() => {
        setLack(""); setImprove(""); setLinkedGoals([]); setCompletedHabits({});
        setLoadedKey(dateKey);
        setSaving("idle");
      });
  }, [user, db, dateKey]);

  // Debounced auto-save on change
  useEffect(() => {
    if (!user) return;
    if (loadedKey !== dateKey) return; // avoid saving while loading
    const ref = doc(db, "users", user.uid, "journal", dateKey);
    const t = setTimeout(() => {
      setSaving("saving");
      const entry: JournalEntry = {
        date: dateKey,
        lack: lack?.trim() || "",
        improve: improve?.trim() || "",
        linkedGoals,
        completedHabits,
        updatedAt: new Date().toISOString(),
      };
      setDoc(ref, entry, { merge: true })
        .then(() => setSaving("saved"))
        .catch(() => setSaving("idle"));
    }, 500);
    return () => clearTimeout(t);
  }, [lack, improve, linkedGoals, completedHabits, dateKey, loadedKey, user, db]);

  // Load goals & habits (live)
  useEffect(() => {
    if (!user) return;
    const goalsRef = collection(db, "users", user.uid, "ltgoals");
    const habitsRef = collection(db, "users", user.uid, "habits");
    const unsubGoals = onSnapshot(query(goalsRef, orderBy("createdAt", "desc")), (snap) => {
      const arr: LTGoal[] = snap.docs.map((d) => {
        const { id: _ignored, ...rest } = (d.data() as LTGoal) || {};
        return { id: d.id, ...rest } as LTGoal;
      });
      setGoals(arr);
    });
    const unsubHabits = onSnapshot(query(habitsRef, orderBy("createdAt", "asc")), (snap) => {
      const arr: Habit[] = snap.docs.map((d) => {
        const { id: _ignored, ...rest } = (d.data() as Habit) || {};
        return { id: d.id, ...rest } as Habit;
      });
      setHabits(arr.slice(0, 3)); // keep UI simple: up to 3
    });
    return () => { unsubGoals(); unsubHabits(); };
  }, [user, db]);

  // Weekly / Monthly reflections load & save
  useEffect(() => {
    if (!user) return;
    const wk = weekStartKey(dateKey);
    const mk = monthKey(dateKey);

    const wRef = doc(db, "users", user.uid, "weekReflections", wk);
    const mRef = doc(db, "users", user.uid, "monthReflections", mk);

    getDoc(wRef)
      .then((s) => { setWeekNote((s.data()?.note as string) ?? ""); setLoadedWeekKey(wk); })
      .catch(() => { setWeekNote(""); setLoadedWeekKey(wk); });
    getDoc(mRef)
      .then((s) => { setMonthNote((s.data()?.note as string) ?? ""); setLoadedMonthKey(mk); })
      .catch(() => { setMonthNote(""); setLoadedMonthKey(mk); });
  }, [user, db, dateKey]);

  useEffect(() => {
    if (!user) return; if (loadedWeekKey !== weekStartKey(dateKey)) return;
    const wk = loadedWeekKey; const ref = doc(db, "users", user.uid, "weekReflections", wk);
    const t = setTimeout(() => { setDoc(ref, { key: wk, note: weekNote, updatedAt: new Date().toISOString() }, { merge: true }); }, 600);
    return () => clearTimeout(t);
  }, [weekNote, loadedWeekKey, dateKey, user, db]);

  useEffect(() => {
    if (!user) return; if (loadedMonthKey !== monthKey(dateKey)) return;
    const mk = loadedMonthKey; const ref = doc(db, "users", user.uid, "monthReflections", mk);
    const t = setTimeout(() => { setDoc(ref, { key: mk, note: monthNote, updatedAt: new Date().toISOString() }, { merge: true }); }, 600);
    return () => clearTimeout(t);
  }, [monthNote, loadedMonthKey, dateKey, user, db]);

  // Calendar month load (for analytics)
  useEffect(() => {
    if (!user) return;
    const startISO = new Date(firstOfMonth); const endISO = new Date(lastOfMonth);
    const s = `${startISO.getFullYear()}-${pad2(startISO.getMonth()+1)}-01`;
    const e = `${endISO.getFullYear()}-${pad2(endISO.getMonth()+1)}-${pad2(endISO.getDate())}`;
    const qy = query(collection(db, "users", user.uid, "journal"), orderBy("date"));
    getDocs(qy).then((snap) => {
      const map: Record<string, boolean> = {};
      snap.forEach((d) => {
        const data = d.data() as JournalEntry;
        if (!data?.date) return;
        if (data.date >= s && data.date <= e) map[data.date] = !!((data.lack && data.lack.trim()) || (data.improve && data.improve.trim()));
      });
      setMonthEntries(map);
    }).catch(() => setMonthEntries({}));
  }, [user, db, calYear, calMonth]);

  // Streaks (last 90 days)
  useEffect(() => {
    if (!user) return;
    const qy = query(collection(db, "users", user.uid, "journal"), orderBy("date"));
    getDocs(qy).then((snap) => {
      const map: Record<string, JournalEntry> = {};
      snap.forEach((d) => { const x = d.data() as JournalEntry; if (x?.date) map[x.date] = x; });

      // Journal streak
      let c = 0; const now = new Date(dateKey + "T00:00:00");
      for (;;) {
        const iso = now.toISOString().slice(0,10);
        const x = map[iso];
        const has = !!(x && ((x.lack && x.lack.trim()) || (x.improve && x.improve.trim())));
        if (has) { c++; now.setDate(now.getDate()-1); } else break;
      }
      setJournalStreak(c);

      // Habit streaks per habit
      const hs: Record<string, number> = {};
      for (const h of habits) {
        let s = 0; const d = new Date(dateKey + "T00:00:00");
        for (;;) {
          const iso = d.toISOString().slice(0,10);
          const x = map[iso];
          const done = !!(x?.completedHabits && x.completedHabits[h.id]);
          if (done) { s++; d.setDate(d.getDate()-1); } else break;
        }
        hs[h.id] = s;
      }
      setHabitStreaks(hs);
    }).catch(() => { setJournalStreak(0); setHabitStreaks({}); });
  }, [user, db, dateKey, habits]);

  const headerNote = useMemo(() => {
    if (saving === "saving") return "Saving…";
    if (saving === "saved") return "Saved";
    return "Auto-saves";
  }, [saving]);

  if (!user) return null;

  // Calendar grid for analytics
  const first = new Date(firstOfMonth);
  const weekday = (first.getDay() + 6) % 7; // Mon=0
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - weekday);
  const cells: { iso: string; inMonth: boolean; completed: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    const inMonth = d.getMonth() === calMonth;
    cells.push({ iso, inMonth, completed: !!monthEntries[iso] });
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-muted-foreground">Daily Journal</div>
          <h1 className="text-2xl font-semibold">Two questions</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
          <div className="text-xs text-muted-foreground min-w-20 text-right">{headerNote}</div>
        </div>
      </div>

      {/* Journaling */}
      <Card>
        <CardHeader>
          <CardTitle>Where do I lack?</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={5} value={lack} onChange={(e) => setLack(e.target.value)} placeholder="Be honest and specific about your gaps today." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What will I do to improve it?</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={5} value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Concrete actions you will take." />
        </CardContent>
      </Card>

      {/* Link to Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Link today to goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {goals.length === 0 && <div className="text-xs text-muted-foreground">No long-term goals yet.</div>}
          <div className="flex flex-wrap gap-2">
            {goals.map((g) => {
              const checked = linkedGoals.includes(g.id);
              return (
                <label key={g.id} className={`px-3 py-1 rounded border cursor-pointer text-sm ${checked ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(e) => {
                      const c = e.target.checked;
                      setLinkedGoals((prev) => c ? [...new Set([...prev, g.id])] : prev.filter((x) => x !== g.id));
                    }}
                  />
                  {g.title}
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Habits */}
      <Card>
        <CardHeader>
          <CardTitle>Daily habits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Add habit (max 3)" value={newHabitName} onChange={(e)=>setNewHabitName(e.target.value)} />
            <Button
              onClick={async () => {
                if (!user) return;
                if (!newHabitName.trim()) return;
                if (habits.length >= 3) return;
                const id = Math.random().toString(36).slice(2,10);
                await setDoc(doc(db, 'users', user.uid, 'habits', id), { id, name: newHabitName.trim(), createdAt: new Date().toISOString() });
                setNewHabitName('');
              }}
              disabled={!newHabitName.trim() || habits.length >= 3}
            >Add</Button>
          </div>
          {habits.length === 0 && <div className="text-xs text-muted-foreground">No habits yet.</div>}
          <div className="space-y-2">
            {habits.map(h => {
              const done = !!completedHabits[h.id];
              const streak = habitStreaks[h.id] ?? 0;
              return (
                <label key={h.id} className="flex items-center gap-3 text-sm p-2 rounded border">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={done}
                    onChange={(e)=> setCompletedHabits(prev => ({ ...prev, [h.id]: e.target.checked }))}
                  />
                  <span className="flex-1">{h.name}</span>
                  <span className="text-xs text-muted-foreground">Streak: {streak}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Long-term goals */}
      <Card>
        <CardHeader>
          <CardTitle>Long-term goals (3–6 months)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <Input placeholder="Goal title" value={newGoalTitle} onChange={(e)=>setNewGoalTitle(e.target.value)} />
            <Input type="date" value={newGoalDue} onChange={(e)=>setNewGoalDue(e.target.value)} />
            <Input placeholder="Short description" value={newGoalDesc} onChange={(e)=>setNewGoalDesc(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={async () => {
                if (!user) return;
                if (!newGoalTitle.trim()) return;
                const id = Math.random().toString(36).slice(2,10);
                const now = new Date().toISOString();
                const g: LTGoal = { id, title: newGoalTitle.trim(), description: newGoalDesc.trim() || undefined, dueDate: newGoalDue || undefined, progress: 0, createdAt: now, updatedAt: now };
                await setDoc(doc(db, 'users', user.uid, 'ltgoals', id), g, { merge: true });
                setNewGoalTitle(''); setNewGoalDue(''); setNewGoalDesc('');
              }}
              disabled={!newGoalTitle.trim()}
            >Add goal</Button>
          </div>

          <div className="space-y-2">
            {goals.map(g => (
              <div key={g.id} className="p-3 rounded border space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{g.title}</div>
                  <div className="text-xs text-muted-foreground">Due: {g.dueDate || '—'}</div>
                </div>
                {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                <div className="flex items-center gap-2">
                  <Input type="range" min={0} max={100} value={g.progress ?? 0} onChange={async (e)=>{
                    const p = Number(e.target.value);
                    await setDoc(doc(db, 'users', user.uid!, 'ltgoals', g.id), { progress: p, updatedAt: new Date().toISOString() }, { merge: true });
                  }} />
                  <div className="w-12 text-right text-sm">{g.progress ?? 0}%</div>
                </div>
              </div>
            ))}
            {goals.length === 0 && <div className="text-xs text-muted-foreground">Add a goal above.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Reflections */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly reflection</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={4} value={weekNote} onChange={(e)=>setWeekNote(e.target.value)} placeholder="What went well this week? What needs improvement?" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly reflection</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={4} value={monthNote} onChange={(e)=>setMonthNote(e.target.value)} placeholder="Key wins, setbacks, and plans for next month." />
        </CardContent>
      </Card>

      {/* Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Journaling streak</div>
            <div className="text-xl font-semibold">{journalStreak} days</div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={()=>{ const d = new Date(calBase); d.setMonth(d.getMonth()-1); d.setDate(1); setCalBase(d); }}>{'‹'} Prev</Button>
            <div className="text-sm">{firstOfMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
            <Button variant="outline" size="sm" onClick={()=>{ const d = new Date(calBase); d.setMonth(d.getMonth()+1); d.setDate(1); setCalBase(d); }}>Next {'›'}</Button>
          </div>

          <div className="grid grid-cols-7 text-xs text-muted-foreground">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d)=> <div key={d} className="text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {cells.map(({ iso, inMonth, completed }) => (
              <div key={iso} className={`aspect-square rounded flex items-center justify-center text-sm
                ${inMonth ? (completed ? 'bg-green-500/80 text-white' : 'bg-muted') : 'bg-muted opacity-50'}`}
                title={`${iso}${completed ? ': entry' : ''}`}
              >
                {new Date(iso).getDate()}
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Goal progress overview</div>
            {goals.length === 0 && <div className="text-xs text-muted-foreground">No goals.</div>}
            {goals.map(g => (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <div className="truncate">{g.title}</div>
                <div className="text-muted-foreground">{g.progress ?? 0}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="text-xs text-muted-foreground">
        Entries auto-save per day. Link goals and track habits to stay aligned.
      </div>
    </div>
  );
}
