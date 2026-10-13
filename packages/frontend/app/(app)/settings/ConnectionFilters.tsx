export function ConnectionFilters<T extends string>({
  label,
  value,
  options,
  onChange,
  search,
  onSearch,
  placeholder,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; count: number }[];
  onChange: (value: T) => void;
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="connection-toolbar">
      <div className="connection-filters" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            <span>{option.count}</span>
          </button>
        ))}
      </div>
      {onSearch && (
        <label className="connection-search">
          <span className="sr-only">{placeholder}</span>
          <input
            type="search"
            value={search ?? ""}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={placeholder}
          />
        </label>
      )}
    </div>
  );
}
