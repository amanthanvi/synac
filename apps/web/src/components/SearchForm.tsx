import styles from './SearchForm.module.css';

type SearchFormProps = {
  action?: string;
  defaultValue?: string;
  placeholder?: string;
  inputName?: string;
  inputId?: string;
  size?: 'md' | 'lg';
};

// Plain GET form: typing + Enter runs full-text search on /search.
// Live suggestions live in one place only, the ⌘K SearchPalette.
// Server-rendered: the form owns no state, and the id is a prop rather than
// useId so the two call sites (home hero, /search) stay unique on their own.
export function SearchForm({
  action = '/search',
  defaultValue,
  placeholder = 'Search terms and acronyms…',
  inputName = 'q',
  inputId = 'search-input',
  size = 'md',
}: SearchFormProps) {
  return (
    <form className={styles.form} action={action} method="get" role="search">
      <div className={`${styles.field} ${size === 'lg' ? styles.fieldLg : ''}`}>
        <label className="srOnly" htmlFor={inputId}>
          Search
        </label>
        <svg
          className={`${styles.icon} ${size === 'lg' ? styles.iconLg : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="11"
            cy="11"
            r="6.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m16 16 4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          className={`${styles.input} ${size === 'lg' ? styles.inputLg : ''}`}
          id={inputId}
          name={inputName}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
        />
      </div>
    </form>
  );
}
