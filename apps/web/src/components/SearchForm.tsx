import { useId } from 'react';

import styles from './SearchForm.module.css';

type SearchFormProps = {
  action?: string;
  defaultValue?: string;
  placeholder?: string;
  inputName?: string;
  inputId?: string;
};

export function SearchForm({
  action = '/search',
  defaultValue,
  placeholder = 'Search terms and acronyms…',
  inputName = 'q',
  inputId,
}: SearchFormProps) {
  const autoId = useId();
  const resolvedInputId = inputId ?? `search-${autoId}`;

  return (
    <form className={styles.form} action={action} method="get" role="search">
      <div className={styles.field}>
        <label className="srOnly" htmlFor={resolvedInputId}>
          Search
        </label>
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4m0-2a8 8 0 1 0 4.9 14.3l4.4 4.4a1 1 0 0 0 1.4-1.4l-4.4-4.4A8 8 0 0 0 10 2"
          />
        </svg>
        <input
          className={styles.input}
          id={resolvedInputId}
          name={inputName}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
        />
      </div>
      <button className={styles.button} type="submit">
        Search
      </button>
    </form>
  );
}
