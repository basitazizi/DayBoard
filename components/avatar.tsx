"use client";

import { cn } from "@/lib/cn";
import { GRADIENTS, type Profile } from "@/lib/personalize";

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "G"
  );
}

/** The person's avatar: a photo, an emoji or their initials, on the colour they picked. */
export function Avatar({ profile, name, size = 36, className, ring }: { profile: Profile; name: string; size?: number; className?: string; ring?: boolean }) {
  const style = { width: size, height: size, background: profile.avatarKind === "photo" ? undefined : GRADIENTS[profile.avatarColor]?.css };
  const ringClass = ring && "ring-4 ring-surface";
  if (profile.avatarKind === "photo" && profile.photo) {
    return (
      // A small data URL the person uploaded; next/image does not help here.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.photo} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", ringClass, className)} style={{ width: size, height: size }} />
    );
  }
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-bold text-white", ringClass, className)} style={{ ...style, fontSize: profile.avatarKind === "emoji" ? size * 0.52 : size * 0.36 }}>
      {profile.avatarKind === "emoji" ? profile.emoji : initialsOf(name)}
    </span>
  );
}
