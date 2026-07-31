import { PublicEntryPage } from '@/components/PublicEntryPage';
import { socFixture } from '../fixtures';

export default function PreviewEntryAcronym() {
  return <PublicEntryPage entryType="ACRONYM" data={socFixture} />;
}
