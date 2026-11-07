import { useMemo, type KeyboardEvent } from 'react'
import { searchAccountIds } from '../../data/profiles'
import { useConsole } from '../../state/consoleStore'

/**
 * Account lookup over the 4,500 id index: one text input, one suggestion
 * list, no fuzzy library. Matches are prefix first then substring
 * (searchAccountIds), Enter opens the first match, and both empty states
 * say what to do next with a real example id instead of a shrug. The
 * input keeps the agreed DOM hook id="account-lookup" so the E6 focus
 * shortcut has one stable target.
 */

interface AccountLookupProps {
  /** The artifact id index, ascending numeric order. */
  ids: readonly string[]
}

export default function AccountLookup({ ids }: AccountLookupProps) {
  const query = useConsole((state) => state.query)
  const selectedId = useConsole((state) => state.selectedId)
  const setQuery = useConsole((state) => state.setQuery)
  const selectAccount = useConsole((state) => state.selectAccount)

  const suggestions = useMemo(() => searchAccountIds(ids, query, 8), [ids, query])

  function openFirst(): void {
    const first = suggestions[0]
    if (first) {
      selectAccount(first)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      openFirst()
    }
  }

  return (
    <section className="cp-panel cp-lookup" aria-labelledby="account-lookup-heading">
      <p className="cp-eyebrow" id="account-lookup-heading">
        Know the customer
      </p>
      <div className="cp-lookup__body" role="search">
        <label className="cp-label" htmlFor="account-lookup">
          Account id
        </label>
        <div className="cp-lookup__row">
          <input
            className="cp-input"
            id="account-lookup"
            name="account-id"
            type="search"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type an account id, for example 68257"
            aria-describedby="account-lookup-hint"
          />
          <button
            type="button"
            className="cp-button"
            onClick={openFirst}
            disabled={suggestions.length === 0}
          >
            Open account
          </button>
        </div>
      </div>

      {query.trim().length === 0 ? (
        <p className="cp-hint" id="account-lookup-hint">
          Type an account id, for example 68257. The index holds 4,500 accounts.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="cp-hint" id="account-lookup-hint">
          No account id matches {query.trim()}. Try five digits, for example 68257.
        </p>
      ) : (
        <p className="cp-hint" id="account-lookup-hint">
          {suggestions.length === 1 ? 'One match.' : `${suggestions.length} matches.`} Press Enter
          to open the first.
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="cp-suggestions" aria-label="Matching accounts">
          {suggestions.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="cp-suggestion"
                data-account-id={id}
                aria-pressed={selectedId === id}
                onClick={() => selectAccount(id)}
              >
                {id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
