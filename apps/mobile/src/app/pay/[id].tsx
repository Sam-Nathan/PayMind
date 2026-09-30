import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../components/PlaceholderScreen.tsx';

export default function PayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="Pay" detail={`id: ${id}`} />;
}
