/* Everything a person can personalise: their profile, the look of the app, and the dashboard layout. */

export type AccentColor = "mono" | "violet" | "teal" | "blue" | "green" | "orange" | "rose" | "pink" | "amber" | "custom";
export type TextSize = "small" | "default" | "large" | "xlarge";
export type FontChoice = "modern" | "friendly" | "classic" | "mono";
export type Density = "comfortable" | "compact";
export type Backdrop = "plain" | "dots" | "grid" | "aurora" | "sunset" | "ocean" | "wallpaper";
export type WidgetId = "upNext" | "plan" | "brief" | "freeTime" | "habits" | "focus" | "comingUp" | "note" | "countdown" | "quote";
export type WidgetColumn = "main" | "side";

export interface WidgetSlot {
  id: WidgetId;
  visible: boolean;
  column: WidgetColumn;
}

export interface Countdown {
  title: string;
  date: string;
}

export interface Prefs {
  /** Bumped when a default changes, so older saved settings can be moved forward. */
  version: number;
  accent: AccentColor;
  customAccent: string;
  textSize: TextSize;
  font: FontChoice;
  density: Density;
  backdrop: Backdrop;
  clock24: boolean;
  weekStart: 0 | 1;
  celebrate: boolean;
  reminders: boolean;
  reminderLead: number;
  widgets: WidgetSlot[];
  countdown: Countdown | null;
  confirmBeforeAdding: boolean;
  autoPlanStudy: boolean;
  voiceInput: boolean;
  focusGoalMinutes: number;
}

export type AvatarKind = "initials" | "emoji" | "photo";

export interface Profile {
  avatarKind: AvatarKind;
  emoji: string;
  /** A small JPEG data URL, at most 160 x 160. */
  photo: string;
  avatarColor: string;
  banner: string;
  tagline: string;
  pronouns: string;
  /** Month and day as MM-DD. */
  birthday: string;
  motto: string;
}

export const WIDGETS: Record<WidgetId, { label: string; detail: string; small?: boolean }> = {
  upNext: { label: "Up next", detail: "The next class or event, with a countdown" },
  plan: { label: "Today's plan", detail: "Everything happening and due today" },
  brief: { label: "Daily brief", detail: "What matters right now, in a few sentences" },
  freeTime: { label: "Free time", detail: "Suggests work for your next open slot" },
  habits: { label: "Habits", detail: "Today's check-ins", small: true },
  focus: { label: "Focus progress", detail: "Minutes focused against your daily goal", small: true },
  comingUp: { label: "Coming up", detail: "Deadlines and exams in the next two weeks" },
  note: { label: "Pinned note", detail: "Your pinned or latest note" },
  countdown: { label: "Countdown", detail: "Days until a date you choose", small: true },
  quote: { label: "Daily motivation", detail: "A short line to start the day", small: true }
};

export const DEFAULT_WIDGETS: WidgetSlot[] = [
  { id: "upNext", visible: true, column: "main" },
  { id: "plan", visible: true, column: "main" },
  { id: "brief", visible: true, column: "side" },
  { id: "freeTime", visible: true, column: "side" },
  { id: "habits", visible: true, column: "side" },
  { id: "focus", visible: true, column: "side" },
  { id: "countdown", visible: false, column: "side" },
  { id: "quote", visible: false, column: "side" },
  { id: "comingUp", visible: true, column: "side" },
  { id: "note", visible: true, column: "side" }
];

export const PREFS_VERSION = 2;

export const DEFAULT_PREFS: Prefs = {
  version: PREFS_VERSION,
  accent: "mono",
  customAccent: "#5b4bf5",
  textSize: "default",
  font: "modern",
  density: "comfortable",
  backdrop: "plain",
  clock24: false,
  weekStart: 0,
  celebrate: true,
  reminders: false,
  reminderLead: 10,
  widgets: DEFAULT_WIDGETS,
  countdown: null,
  confirmBeforeAdding: true,
  autoPlanStudy: true,
  voiceInput: true,
  focusGoalMinutes: 120
};

export const DEFAULT_PROFILE: Profile = {
  avatarKind: "initials",
  emoji: "🦊",
  photo: "",
  avatarColor: "graphite",
  banner: "graphite",
  tagline: "",
  pronouns: "",
  birthday: "",
  motto: ""
};

/** Gradients for avatars and the profile banner. */
export const GRADIENTS: Record<string, { label: string; css: string }> = {
  sunrise: { label: "Sunrise", css: "linear-gradient(135deg,#ffb86b,#e0476b)" },
  violet: { label: "Violet", css: "linear-gradient(120deg,#4b3be8,#a268f5)" },
  ocean: { label: "Ocean", css: "linear-gradient(135deg,#2470d8,#2bc0c9)" },
  forest: { label: "Forest", css: "linear-gradient(135deg,#1f7a4c,#8bc34a)" },
  candy: { label: "Candy", css: "linear-gradient(135deg,#f472b6,#a78bfa)" },
  ember: { label: "Ember", css: "linear-gradient(135deg,#f97316,#b91c1c)" },
  night: { label: "Night", css: "linear-gradient(135deg,#1e1b4b,#0f172a)" },
  graphite: { label: "Graphite", css: "linear-gradient(135deg,#4b5563,#111827)" }
};

export const AVATAR_EMOJIS = ["🦊", "🐼", "🐨", "🦉", "🐸", "🐙", "🦄", "🐯", "🐧", "🐝", "🌵", "🌻", "🍀", "🌙", "⭐", "🔥", "⚡", "🎧", "🎨", "📚", "🧠", "🚀", "🏀", "⚽", "🎮", "☕", "🍩", "🌊"];

export const ACCENTS: Array<{ value: Exclude<AccentColor, "custom">; label: string; color: string }> = [
  { value: "mono", label: "Black and white", color: "#14161c" },
  { value: "violet", label: "Violet", color: "#5b4bf5" },
  { value: "blue", label: "Blue", color: "#2470d8" },
  { value: "teal", label: "Teal", color: "#0b8f80" },
  { value: "green", label: "Green", color: "#25874a" },
  { value: "amber", label: "Amber", color: "#b8730a" },
  { value: "orange", label: "Orange", color: "#e2620f" },
  { value: "rose", label: "Rose", color: "#d13a60" },
  { value: "pink", label: "Pink", color: "#d03c9b" }
];

export const FONTS: Array<{ value: FontChoice; label: string; sample: string }> = [
  { value: "modern", label: "Modern", sample: "var(--font-inter)" },
  { value: "friendly", label: "Friendly", sample: "var(--font-nunito)" },
  { value: "classic", label: "Classic", sample: "var(--font-lora)" },
  { value: "mono", label: "Typewriter", sample: "var(--font-jbmono)" }
];

export const BACKDROPS: Array<{ value: Backdrop; label: string }> = [
  { value: "plain", label: "Plain" },
  { value: "dots", label: "Dots" },
  { value: "grid", label: "Grid" },
  { value: "aurora", label: "Aurora" },
  { value: "sunset", label: "Sunset" },
  { value: "ocean", label: "Ocean" },
  { value: "wallpaper", label: "My photo" }
];

/** Short original lines for the "Daily motivation" card. One is shown per day. */
export const QUOTES = [
  "Small steps every day add up to big results.",
  "Start with the hardest thing while your mind is fresh.",
  "Done is better than perfect. Then make it better.",
  "One focused hour beats three distracted ones.",
  "You don't need more time, just the next step.",
  "Future you will thank you for starting today.",
  "Progress, not perfection.",
  "Make today count, then rest without guilt.",
  "Discipline is choosing what you want most over what you want now.",
  "A plan turns a wish into a schedule.",
  "Be proud of how far you've come, and keep going.",
  "Break it down until the first step feels easy.",
  "Consistency beats intensity.",
  "Every expert was once a beginner who kept going.",
  "Protect your focus like it's your most valuable thing. It is.",
  "Rest is part of the work.",
  "You've handled hard days before. You'll handle this one.",
  "Ten minutes of starting beats an hour of worrying.",
  "Learn something today that you didn't know yesterday.",
  "Your pace is still progress."
];

const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[];

/** Accepts saved preferences from any older version and fills in anything missing. */
export function normalizePrefs(raw: unknown): Prefs {
  const saved = (raw && typeof raw === "object" ? raw : {}) as Partial<Prefs> & { showHabits?: boolean; showFocus?: boolean; showNotes?: boolean };
  const prefs: Prefs = { ...DEFAULT_PREFS, ...saved };
  // Version 1 had violet as the default, so a saved violet was almost always untouched. Version 2 starts in black and white.
  if (!saved.version || saved.version < 2) {
    if (!saved.accent || saved.accent === "violet") prefs.accent = "mono";
  }
  prefs.version = PREFS_VERSION;

  const known = Array.isArray(saved.widgets) ? saved.widgets.filter((slot) => slot && WIDGET_IDS.includes(slot.id)) : [];
  const seen = new Set(known.map((slot) => slot.id));
  const widgets: WidgetSlot[] = [
    ...known.map((slot) => ({ id: slot.id, visible: slot.visible !== false, column: slot.column === "main" ? ("main" as const) : ("side" as const) })),
    ...DEFAULT_WIDGETS.filter((slot) => !seen.has(slot.id))
  ];
  // Older versions stored three on/off switches instead of a layout.
  if (!Array.isArray(saved.widgets)) {
    for (const slot of widgets) {
      if (slot.id === "habits" && saved.showHabits === false) slot.visible = false;
      if (slot.id === "focus" && saved.showFocus === false) slot.visible = false;
      if (slot.id === "note" && saved.showNotes === false) slot.visible = false;
    }
  }
  prefs.widgets = widgets;
  if (!/^#[0-9a-f]{6}$/i.test(prefs.customAccent)) prefs.customAccent = DEFAULT_PREFS.customAccent;
  if (prefs.weekStart !== 0 && prefs.weekStart !== 1) prefs.weekStart = 0;
  if (![5, 10, 15, 30].includes(prefs.reminderLead)) prefs.reminderLead = 10;
  // A countdown may be saved with only a title while the date is still being picked.
  if (prefs.countdown) {
    const { title, date } = prefs.countdown;
    if (typeof title !== "string" || typeof date !== "string" || (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date))) prefs.countdown = null;
    else prefs.countdown = { title: title.slice(0, 40), date };
  }
  delete (prefs as Partial<typeof saved>).showHabits;
  delete (prefs as Partial<typeof saved>).showFocus;
  delete (prefs as Partial<typeof saved>).showNotes;
  return prefs;
}

export function normalizeProfile(raw: unknown): Profile {
  const saved = (raw && typeof raw === "object" ? raw : {}) as Partial<Profile>;
  const profile: Profile = { ...DEFAULT_PROFILE, ...saved };
  if (!["initials", "emoji", "photo"].includes(profile.avatarKind)) profile.avatarKind = "initials";
  if (profile.avatarKind === "photo" && !profile.photo.startsWith("data:image/")) profile.avatarKind = "initials";
  if (!GRADIENTS[profile.avatarColor]) profile.avatarColor = DEFAULT_PROFILE.avatarColor;
  if (!GRADIENTS[profile.banner]) profile.banner = DEFAULT_PROFILE.banner;
  if (!/^\d{2}-\d{2}$/.test(profile.birthday)) profile.birthday = "";
  profile.tagline = profile.tagline.slice(0, 80);
  profile.pronouns = profile.pronouns.slice(0, 30);
  profile.motto = profile.motto.slice(0, 120);
  return profile;
}

export function isBirthday(profile: Profile, dateKey: string) {
  return Boolean(profile.birthday) && dateKey.slice(5) === profile.birthday;
}

/** Shrinks an image file to a small square JPEG for an avatar, or a wide one for a wallpaper. */
export async function imageToDataUrl(file: File, maxSide: number, square: boolean, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = square ? (bitmap.width - side) / 2 : 0;
  const sy = square ? (bitmap.height - side) / 2 : 0;
  const sw = square ? side : bitmap.width;
  const sh = square ? side : bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images.");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
