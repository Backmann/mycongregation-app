import { useLocalSearchParams } from 'expo-router';
import { SpecialEventDetail } from '../../../components/SpecialEventDetail';

export default function SpecialEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SpecialEventDetail id={id!} />;
}
