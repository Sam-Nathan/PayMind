import { z } from 'npm:zod@4';
import { adminClient, enforceRateLimit, requireUser } from '../_shared/auth.ts';
import { rupees } from '../_shared/detective.ts';
import { HttpError, json, readJson, serveJson } from '../_shared/http.ts';

const BodySchema = z
  .object({
    /** All member rows of the same person (one per space) to remind in one combined message. */
    memberIds: z.array(z.uuid()).min(1).max(10).optional(),
    memberId: z.uuid().optional(),
    tone: z.enum(['friendly', 'neutral', 'firm']).default('friendly'),
    repeat: z.enum(['once', 'every_3_days', 'weekly']).default('once'),
    /** Optional explicit amounts (paise) per member row, e.g. from packages/core's simplified debts. */
    items: z.array(z.object({ memberId: z.uuid(), amountMinor: z.number().int().positive() })).max(10).optional(),
  })
  .refine((b) => b.memberIds?.length || b.memberId, { message: 'memberIds is required' });

interface MemberRow {
  id: string;
  space_id: string;
  display_name: string;
  user_id: string | null;
  spaces: { name: string } | null;
}

function buildMessage(tone: 'friendly' | 'neutral' | 'firm', name: string, lines: { space: string; amount: number }[], total: number, url: string): string {
  const first = name.trim().split(/\s+/)[0];
  const bullets = lines.map((l) => `• ${l.space} — ${rupees(l.amount)}`).join('\n');
  const n = lines.length;
  if (tone === 'friendly') {
    const head = n === 1 ? `Hey ${first}! Quick one — ${rupees(total)} is pending for ${lines[0].space}.` : `Hey ${first}! Quick one — ${n} shared expenses add up to ${rupees(total)}:\n${bullets}`;
    return `${head}\nNo rush, whenever you get a sec\n${url}`;
  }
  if (tone === 'neutral') {
    const head = n === 1 ? `Hi ${first}, you have a shared expense of ${rupees(total)} in ${lines[0].space}.` : `Hi ${first}, you have ${n} shared expenses totalling ${rupees(total)}:\n${bullets}`;
    return `${head}\n${url}`;
  }
  const head = n === 1 ? `Reminder: ${rupees(total)} is pending for ${lines[0].space}.` : `Reminder: ${rupees(total)} is pending:\n${bullets}`;
  return `${head}\nPlease settle it today.\n${url}`;
}

function randomToken(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(
  serveJson(async (req) => {
    const ctx = await requireUser(req);
    // Each reminder can push to other people's phones: keep it well below spam levels.
    await enforceRateLimit(ctx, 'send-reminder', 20);
    const parsed = BodySchema.safeParse(await readJson(req, 100_000));
    if (!parsed.success) throw new HttpError(400, 'invalid_request', parsed.error.issues.map((i) => i.message).join('; '));
    const { tone, repeat } = parsed.data;
    const memberIds = [...new Set(parsed.data.memberIds ?? [parsed.data.memberId!])];

    const { data: rows, error } = await ctx.supabase
      .from('space_members')
      .select('id, space_id, display_name, user_id, spaces(name)')
      .in('id', memberIds);
    if (error) throw new HttpError(500, 'lookup_failed', 'Could not load members');
    const members = (rows ?? []) as unknown as MemberRow[];
    if (members.length !== memberIds.length) throw new HttpError(404, 'member_not_found', 'One of those people is not in your spaces');
    if (members.some((m) => m.user_id === ctx.userId)) throw new HttpError(400, 'cannot_remind_self', "You can't send a reminder to yourself");

    // What each member owes the caller: explicit items, else derived from balances.
    const explicit = new Map((parsed.data.items ?? []).map((i) => [i.memberId, i.amountMinor]));
    const spaceIds = [...new Set(members.map((m) => m.space_id))];
    const { data: bal } = await ctx.supabase.from('balances').select('space_id, member_id, user_id, net_minor').in('space_id', spaceIds);
    const lines: { space_id: string; space: string; amount: number }[] = [];
    for (const m of members) {
      let amount = explicit.get(m.id) ?? 0;
      if (!explicit.has(m.id)) {
        const mine = (bal ?? []).find((b) => b.space_id === m.space_id && b.user_id === ctx.userId);
        const theirs = (bal ?? []).find((b) => b.member_id === m.id);
        if (mine && theirs && mine.net_minor > 0 && theirs.net_minor < 0) amount = Math.min(mine.net_minor, -theirs.net_minor);
      }
      if (amount > 0) lines.push({ space_id: m.space_id, space: m.spaces?.name ?? 'Shared expenses', amount });
    }
    if (lines.length === 0) throw new HttpError(400, 'nothing_owed', 'This person does not owe you anything right now');
    const total = lines.reduce((s, l) => s + l.amount, 0);

    const token = randomToken();
    const base = (Deno.env.get('PUBLIC_WEB_URL') || 'https://paymind.vercel.app').replace(/\/+$/, '');
    const url = `${base}/pay/${token}`;
    const message = buildMessage(tone, members[0].display_name, lines, total, url);
    const noteRef = `PM-${token.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;
    const nextAt = repeat === 'once' ? null : new Date(Date.now() + (repeat === 'weekly' ? 7 : 3) * 86400_000).toISOString();

    const { data: reminder, error: insErr } = await ctx.supabase
      .from('reminders')
      .insert({
        from_user: ctx.userId,
        to_member: members[0].id,
        amount_minor: total,
        items: lines.map((l) => ({ space_id: l.space_id, label: l.space, amount_minor: l.amount })),
        tone,
        repeat,
        message,
        next_at: nextAt,
        last_sent_at: new Date().toISOString(),
        link_token: token,
        note_ref: noteRef,
      })
      .select('id')
      .single();
    if (insErr || !reminder) {
      console.error('reminder insert failed', insErr?.message);
      throw new HttpError(500, 'insert_failed', 'Could not create the reminder');
    }

    // Best-effort push to recipients who have the app.
    let pushed = 0;
    try {
      const recipients = members.map((m) => m.user_id).filter((u): u is string => !!u);
      if (recipients.length) {
        const admin = adminClient();
        const [{ data: prefs }, { data: devices }, { data: me }] = await Promise.all([
          admin.from('notification_prefs').select('user_id, settlement_reminders').in('user_id', recipients),
          admin.from('devices').select('user_id, expo_push_token').in('user_id', recipients),
          admin.from('profiles').select('name').eq('id', ctx.userId).maybeSingle(),
        ]);
        const muted = new Set((prefs ?? []).filter((p) => !p.settlement_reminders).map((p) => p.user_id));
        const tokens = (devices ?? []).filter((d) => !muted.has(d.user_id)).map((d) => d.expo_push_token);
        if (tokens.length) {
          const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(
              tokens.map((to) => ({
                to,
                title: `${me?.name ?? 'Someone'} sent a reminder`,
                body: `${rupees(total)} is pending. Tap to pay.`,
                data: { type: 'reminder', reminderId: reminder.id, url },
              })),
            ),
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) pushed = tokens.length;
        }
      }
    } catch (e) {
      console.error('push failed (ignored)', (e as Error).message);
    }

    return json({
      reminderId: reminder.id,
      message,
      url,
      token,
      amountMinor: total,
      items: lines.map((l) => ({ spaceId: l.space_id, spaceName: l.space, amountMinor: l.amount })),
      pushed,
    });
  }),
);
