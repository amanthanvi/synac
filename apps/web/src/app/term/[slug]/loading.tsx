import entryStyles from '@/app/_styles/Entry.module.css';
import loadingStyles from '@/app/_styles/EntryLoading.module.css';

export default function Loading() {
  return (
    <div className={entryStyles.layout} aria-busy="true" aria-label="Loading entry">
      <div className={entryStyles.main} aria-hidden="true">
        <header className={entryStyles.header}>
          <div className={`skeleton ${loadingStyles.title}`} />
          <div className={`skeleton ${loadingStyles.subtitle}`} />
          <div className={loadingStyles.metaRow}>
            <div className={`skeleton ${loadingStyles.metaItem}`} />
            <div className={`skeleton ${loadingStyles.metaItem}`} />
          </div>
        </header>

        <ol className={entryStyles.senseList}>
          {Array.from({ length: 2 }, (_, idx) => (
            <li key={idx} className={entryStyles.sense}>
              <div className={`skeleton ${loadingStyles.senseNumber}`} />
              <div className={loadingStyles.senseLines}>
                <div className={`skeleton ${loadingStyles.line}`} />
                <div className={`skeleton ${loadingStyles.line}`} />
                <div className={`skeleton ${loadingStyles.lineShort}`} />
                <div className={`skeleton ${loadingStyles.sourceLine}`} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
