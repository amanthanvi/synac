import { PublicEntryPage } from '@/components/PublicEntryPage';
import { defaultCredentialsFixture } from '../fixtures';

export default function PreviewEntryTerm() {
  return <PublicEntryPage entryType="TERM" data={defaultCredentialsFixture} />;
}
