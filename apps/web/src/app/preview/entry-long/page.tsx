import { PublicEntryPage } from '@/components/PublicEntryPage';
import { shellFixture } from '../fixtures';

export default function PreviewEntryLong() {
  return <PublicEntryPage entryType="TERM" data={shellFixture} />;
}
