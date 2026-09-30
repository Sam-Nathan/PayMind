import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../components/PlaceholderScreen.tsx';

export default function UnderstandScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="Understand" detail={`id: ${id}`} />;
}
