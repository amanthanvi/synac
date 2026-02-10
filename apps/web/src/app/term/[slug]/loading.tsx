import entryStyles from '@/app/_styles/Entry.module.css';
import loadingStyles from '@/app/_styles/EntryLoading.module.css';

export default function Loading() {
  return (
    <div className={entryStyles.layout} aria-busy="true" aria-label="Loading entry">
      <div className={entryStyles.main}>
        <header className={entryStyles.header} aria-hidden="true">
          <div className={entryStyles.badgeRow}>
            <div className={`skeleton ${loadingStyles.badge}`} />
          </div>
          <div className={`skeleton ${loadingStyles.title}`} />
          <div className={loadingStyles.headerLines}>
            <div className={`skeleton ${loadingStyles.summaryLine}`} />
            <div className={`skeleton ${loadingStyles.summaryLineShort}`} />
          </div>
          <div className={entryStyles.meta}>
            <div className={loadingStyles.metaRow}>
              <div className={`skeleton ${loadingStyles.metaPill}`} />
              <div className={`skeleton ${loadingStyles.metaPillWide}`} />
              <div className={`skeleton ${loadingStyles.metaPill}`} />
              <div className={`skeleton ${loadingStyles.metaTag}`} />
              <div className={`skeleton ${loadingStyles.metaTag}`} />
            </div>
          </div>
        </header>

        <section className={entryStyles.section} aria-label="Senses">
          <h2 className={entryStyles.sectionTitle}>Senses</h2>
          <div className={entryStyles.senseList} aria-hidden="true">
            {Array.from({ length: 3 }, (_, idx) => (
              <div key={idx} className={entryStyles.senseCard}>
                <div className={loadingStyles.senseHeader}>
                  <div className={`skeleton ${loadingStyles.senseLabel}`} />
                  <div className={`skeleton ${loadingStyles.senseChevron}`} />
                </div>
                <div className={loadingStyles.excerpt}>
                  <div className={`skeleton ${loadingStyles.excerptLine}`} />
                  <div className={`skeleton ${loadingStyles.excerptLineShort}`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={loadingStyles.toc} aria-hidden="true">
        <div className={`skeleton ${loadingStyles.tocTitle}`} />
        <div className={`skeleton ${loadingStyles.tocLine}`} />
        <div className={`skeleton ${loadingStyles.tocLineShort}`} />
        <div className={`skeleton ${loadingStyles.tocLine}`} />
        <div className={`skeleton ${loadingStyles.tocLineShort}`} />
      </div>
    </div>
  );
}

