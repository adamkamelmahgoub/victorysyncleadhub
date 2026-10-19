import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDisplayName, getInitials, type ContactDisplay } from "@/lib/contact-display";
import { cn } from "@/lib/utils";

type ContactWithPhoto = ContactDisplay & { customFields?: Record<string, unknown> | null };

export function getContactPhotoUrl(contact: ContactWithPhoto): string | undefined {
  const fields = contact.customFields ?? {};
  const value = [fields.profilePhotoUrl, fields.profile_photo_url, fields.avatarUrl, fields.avatar_url, fields.photoUrl, fields.photo_url, fields.imageUrl, fields.image_url]
    .find((entry) => typeof entry === "string" && entry.trim()) as string | undefined;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

const colors = [
  "bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
];

export function ContactAvatar({ contact, className }: { contact: ContactWithPhoto; className?: string }) {
  const name = getDisplayName(contact);
  const color = colors[Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
  return <Avatar className={cn("size-9 border border-white shadow-sm ring-1 ring-slate-200", className)}>
    <AvatarImage src={getContactPhotoUrl(contact)} alt={`${name} profile picture`} className="object-cover" />
    <AvatarFallback className={cn("text-xs font-semibold", color)} delayMs={0}>{getInitials(contact)}</AvatarFallback>
  </Avatar>;
}
