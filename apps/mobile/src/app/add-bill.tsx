import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  DotTexture,
  ErrorNote,
  ScreenHeader,
  SegmentedControl,
  palette,
} from '../components/index.ts';
import { aiErrorCopy, isAiDisabled, useParseBill, type ParseBillInput } from '../data/ai.ts';
import { useInboxCount } from '../data/useHome.ts';
import { prepareBillImage } from '../features/ai/imagePrep.ts';
import { AiOffNote, HideNativeHeader } from '../features/ai/ui/chrome.tsx';

type Source = 'camera' | 'upload' | 'ebill';

const OPTIONS = [
  { value: 'camera', label: 'Camera' },
  { value: 'upload', label: 'Upload' },
  { value: 'ebill', label: 'E-bill' },
] as const;

export default function AddBillScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inbox = useInboxCount();
  const parse = useParseBill();
  const [source, setSource] = useState<Source>('camera');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [text, setText] = useState('');

  const analyse = async (input: ParseBillInput | (() => Promise<ParseBillInput>)) => {
    setError(null);
    setBusy(true);
    try {
      const body = typeof input === 'function' ? await input() : input;
      const res = await parse.mutateAsync(body);
      router.replace({ pathname: '/understand/[id]', params: { id: res.proposalId } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const fromAsset = (asset: ImagePicker.ImagePickerAsset) => analyse(() => prepareBillImage(asset));

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setCameraDenied(true);
      return;
    }
    setCameraDenied(false);
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled && res.assets[0]) await fromAsset(res.assets[0]);
  };

  const allowCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) {
      setCameraDenied(false);
      await takePhoto();
    } else if (!perm.canAskAgain) {
      Linking.openSettings().catch(() => {});
    }
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled && res.assets[0]) await fromAsset(res.assets[0]);
  };

  const readText = () => {
    const t = text.trim();
    if (t.length < 10) {
      setError(new Error('Paste the full text of the bill first.'));
      return;
    }
    analyse({ text: t.slice(0, 20000) });
  };

  const count = inbox.data?.count ?? 0;

  return (
    <View className="flex-1 bg-paper">
      <HideNativeHeader />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Add a bill" onBack={() => router.back()} />
        <SegmentedControl options={OPTIONS} value={source} onChange={setSource} />

        {source === 'camera' ? (
          <>
            <Card tone="ink" radius={28} padding={0} style={{ height: 420 }}>
              <DotTexture />
              <View className="items-center pt-4">
                <View className="h-[34px] flex-row items-center gap-2 rounded-pill bg-[#1B1F29] px-4">
                  {busy ? <ActivityIndicator size="small" color={palette.paper} /> : null}
                  <Text className="font-sans-semibold text-[13px] text-paper">
                    {busy ? 'Reading your bill…' : cameraDenied ? 'Camera is off' : 'Looking for a bill…'}
                  </Text>
                </View>
              </View>
              <View className="flex-1 items-center justify-center px-8">
                {cameraDenied ? (
                  <View className="items-center gap-3">
                    <Text className="font-sans-semibold text-center text-[16px] text-paper">
                      PayMind needs the camera to scan a bill.
                    </Text>
                    <Text className="font-sans text-center text-[13px] text-steel">Upload still works without it.</Text>
                    <Button label="Allow camera" variant="paperOnInk" size="sm" onPress={allowCamera} />
                  </View>
                ) : (
                  <View className="h-[260px] w-[220px] items-center justify-center rounded-[20px] border-2 border-clay">
                    <Ionicons name="receipt-outline" size={40} color={palette.clay} />
                    <Text className="font-sans-medium mt-3 px-4 text-center text-[14px] text-paper/80">
                      Fit the whole bill inside the frame
                    </Text>
                  </View>
                )}
              </View>
            </Card>
            <View className="flex-row items-center justify-center gap-8">
              <Pressable
                onPress={pickPhoto}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Choose from gallery"
                className="h-14 w-14 items-center justify-center rounded-[18px] border border-hairline bg-white active:opacity-80"
              >
                <Ionicons name="image-outline" size={24} color={palette.ink} />
              </Pressable>
              <Pressable
                onPress={takePhoto}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Take a photo of the bill"
                className="h-[84px] w-[84px] items-center justify-center rounded-full bg-signal/20 active:opacity-80"
              >
                <View className="h-[66px] w-[66px] rounded-full border-[3px] border-white bg-signal" />
              </Pressable>
              <View className="h-14 w-14" />
            </View>
          </>
        ) : null}

        {source === 'upload' ? (
          <Card tone="white" radius={28} padding={18}>
            <Text className="font-sans-semibold text-[17px] text-ink">Upload a bill photo or screenshot</Text>
            <Text className="font-sans mt-1.5 text-[14px] leading-5 text-muted">
              Pick a photo of a printed bill or a screenshot of an e-bill. For a PDF, take a screenshot of it, or paste its text in the E-bill tab.
            </Text>
            <View className="mt-4">
              <Button label="Choose a photo" icon="image-outline" size="lg" loading={busy} onPress={pickPhoto} />
            </View>
          </Card>
        ) : null}

        {source === 'ebill' ? (
          <Card tone="white" radius={28} padding={18}>
            <Text className="font-sans-semibold text-[17px] text-ink">Paste an e-bill</Text>
            <Text className="font-sans mt-1.5 text-[14px] leading-5 text-muted">
              Copy the text of the bill from your email or app and paste it here.
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Paste the e-bill text…"
              placeholderTextColor={palette.stone}
              textAlignVertical="top"
              accessibilityLabel="E-bill text"
              className="font-sans mt-3 min-h-[160px] rounded-2xl border border-hairline bg-paper p-3 text-[15px] text-ink"
            />
            <View className="mt-4">
              <Button label="Read this bill" size="lg" loading={busy} disabled={text.trim().length === 0} onPress={readText} />
            </View>
          </Card>
        ) : null}

        {error ? (
          isAiDisabled(error) ? (
            <AiOffNote message={aiErrorCopy(error)} />
          ) : (
            <ErrorNote message={aiErrorCopy(error)} />
          )
        ) : null}

        <Text className="font-sans px-2 text-center text-[13px] leading-5 text-muted">
          Works with printed bills, screenshots and e-bills from email. Nothing is saved until you confirm.
        </Text>

        <View className="mt-2">
          <Pressable
            onPress={() => router.push('/capture-inbox')}
            accessibilityRole="button"
            accessibilityLabel={`Picked up automatically, ${count} to review`}
            className="flex-row items-center justify-between rounded-[24px] border border-hairline bg-white p-4 active:opacity-90"
          >
            <View className="flex-1 pr-3">
              <Text className="font-sans-semibold text-[18px] text-ink">Picked up automatically</Text>
              {count === 0 ? (
                <Text className="font-sans mt-1 text-[13px] text-muted">
                  Nothing to review. Payment alerts you allow will show up here.
                </Text>
              ) : null}
            </View>
            <Text className="font-sans text-[14px] text-muted">{count > 0 ? `${count} to review` : ''}</Text>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
