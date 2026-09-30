import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../components/PlaceholderScreen.tsx';

export default function VerifypaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="Verify payment" detail={`id: ${id}`} />;
}
