import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../components/PlaceholderScreen.tsx';

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="Split" detail={`id: ${id}`} />;
}
