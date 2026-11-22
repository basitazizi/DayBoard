import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How DayBoard handles your information."
};

/**
 * TODO before publishing: replace this with the email address people should write to about privacy.
 * Google Play shows this policy on your store listing.
 */
const CONTACT_EMAIL = "aziziabdulbasit35@gmail.com";
const UPDATED = "November 21, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-bold tracking-[-0.01em]">{title}</h2>
      <div className="grid gap-3 leading-relaxed text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-bg px-5 py-10 text-ink">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="mb-10 inline-flex items-center gap-2.5 text-lg font-bold tracking-[-0.02em]">
          <LogoMark size={32} />
          DayBoard
        </Link>
        <h1 className="text-3xl font-bold tracking-[-0.02em]">Privacy policy</h1>
        <p className="mt-2 text-sm text-ink-3">Last updated {UPDATED}</p>
        <p className="mt-6 leading-relaxed text-ink-2">
          DayBoard is a planner for students. This policy explains what information DayBoard keeps, why, and the choices you have. It applies to the DayBoard website and the DayBoard Android app, which shows the same website.
        </p>

        <Section title="What DayBoard keeps">
          <ul className="grid gap-2">
            <li>
              <strong>Your account:</strong> your email address, password (stored only in scrambled form by our sign-in provider) and display name.
            </li>
            <li>
              <strong>What you add:</strong> tasks, calendar events, classes, assignments, exams, grades, habits, notes and focus sessions.
            </li>
            <li>
              <strong>Your settings and profile:</strong> theme, layout, headline, pronouns, motto, birthday (month and day only) and avatar, including a photo if you choose one.
            </li>
          </ul>
          <p>If you use DayBoard without an account, all of this stays in your browser on your device and is never sent to us.</p>
        </Section>

        <Section title="How it is used">
          <p>Only to run DayBoard for you: to show your plans, sync them between your devices, plan study sessions and answer your questions. We do not sell your information, show ads, or use it to track you across other apps or websites.</p>
        </Section>

        <Section title="Services that help run DayBoard">
          <ul className="grid gap-2">
            <li>
              <strong>Supabase</strong> stores accounts and data for signed-in users.
            </li>
            <li>
              <strong>Vercel</strong> hosts the website.
            </li>
            <li>
              <strong>Anthropic</strong> powers the full assistant. When you are signed in and ask an open question or add something from a photo, your message, the photo and a summary of your schedule are sent to it to produce an answer. Simple questions and typed adds are handled on your device.
            </li>
            <li>
              <strong>Your browser&apos;s speech recognition</strong> turns speech into text when you use voice input. Depending on your browser, the audio may be processed by its maker, such as Google or Apple. DayBoard never records or stores audio.
            </li>
          </ul>
        </Section>

        <Section title="Notifications">
          <p>If you turn on reminders, DayBoard asks your permission to show notifications. Reminders are created on your device from your own schedule. You can turn them off in Settings at any time.</p>
        </Section>

        <Section title="Your choices">
          <ul className="grid gap-2">
            <li>Change or remove anything you have added, at any time.</li>
            <li>Download a copy of all your data from Settings → General → Backup.</li>
            <li>
              Delete your account and everything in it from Settings → Profile → Delete account, on the website or in the app. Deletion is permanent and happens straight away.
            </li>
          </ul>
        </Section>

        <Section title="Keeping it safe">
          <p>Information is sent over encrypted connections. Each signed-in person can only read and change their own records.</p>
        </Section>

        <Section title="Children">
          <p>DayBoard is meant for students aged 13 and over. If you believe a child under 13 has created an account, contact us and we will delete it.</p>
        </Section>

        <Section title="Changes and contact">
          <p>If this policy changes, the date at the top will change too. Questions or requests:</p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ink underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </article>
    </main>
  );
}
