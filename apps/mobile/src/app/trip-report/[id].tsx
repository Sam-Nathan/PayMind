import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../components/PlaceholderScreen.tsx';

export default function TripreportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="Trip report" detail={`id: ${id}`} />;
}
