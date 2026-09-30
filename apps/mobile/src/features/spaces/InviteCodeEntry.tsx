import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, Sheet, TextField } from '../../components/index.ts';
import { parseInviteCode } from './logic.ts';

/** "Have an invite code?" button + sheet; opens the invite/[code] screen. */
export function InviteCodeEntry() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const code = parseInviteCode(text);
  return (
    <>
      <Button label="Have an invite code?" variant="ghost" size="sm" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Join with an invite">
        <TextField
          label="Invite code or link"
          value={text}
          onChangeText={setText}
          placeholder="e.g. K7M2QX9A"
          autoCapitalize="characters"
          error={text.trim() && !code ? 'That doesn’t look like an invite code' : null}
        />
        <Button
          label="Continue"
          size="lg"
          disabled={!code}
          onPress={() => {
            setOpen(false);
            router.push(`/invite/${code}`);
          }}
          style={{ marginTop: 12 }}
        />
      </Sheet>
    </>
  );
}
