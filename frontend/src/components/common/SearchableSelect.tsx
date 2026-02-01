import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

// Tipo per opzione con valore e label
export interface SelectOption {
  value: string | number;
  label: string;
}

// Props per SearchableSelect - supporta sia stringhe che oggetti
interface SearchableSelectProps {
  label?: string;
  options: readonly string[] | readonly SelectOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  required?: boolean;
  allowCustom?: boolean;
  disabled?: boolean;
  className?: string;
}

// Helper per determinare se le opzioni sono oggetti
function isObjectOptions(options: readonly string[] | readonly SelectOption[]): options is readonly SelectOption[] {
  return options.length > 0 && typeof options[0] === 'object';
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Cerca o seleziona...',
  required = false,
  allowCustom = false,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Normalizza le opzioni in formato oggetto
  const normalizedOptions: SelectOption[] = useMemo(() => {
    if (isObjectOptions(options)) {
      return options as SelectOption[];
    }
    return (options as readonly string[]).map(opt => ({ value: opt, label: opt }));
  }, [options]);

  // Filtra le opzioni in base alla ricerca
  const filteredOptions = useMemo(() => {
    if (!search) return normalizedOptions;
    const searchLower = search.toLowerCase();
    return normalizedOptions.filter(opt =>
      opt.label.toLowerCase().includes(searchLower)
    );
  }, [normalizedOptions, search]);

  // Trova la label del valore corrente
  const currentLabel = useMemo(() => {
    const found = normalizedOptions.find(opt => opt.value === value);
    return found?.label || (value ? String(value) : '');
  }, [normalizedOptions, value]);

  // Chiudi dropdown quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll all'elemento evidenziato
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const handleSelect = (option: SelectOption) => {
    onChange(option.value);
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setHighlightedIndex(-1);
    if (!isOpen) setIsOpen(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (allowCustom && search && filteredOptions.length === 0) {
        onChange(search);
        setIsOpen(false);
        setSearch('');
      } else if (filteredOptions.length === 1) {
        handleSelect(filteredOptions[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
      setHighlightedIndex(-1);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      setSearch('');
    }
  };

  const handleContainerClick = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  // Evidenzia il testo che corrisponde alla ricerca
  const highlightMatch = (text: string) => {
    if (!search) return text;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === search.toLowerCase() ? (
        <span key={i} className="bg-yellow-200 font-medium">{part}</span>
      ) : (
        part
      )
    );
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && '*'}
        </label>
      )}
      <div
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm bg-white flex items-center justify-between transition-all ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed'
            : 'cursor-pointer hover:border-gray-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500'
        }`}
        onClick={handleContainerClick}
      >
        <div className="flex items-center flex-1 min-w-0">
          <Search size={16} className="text-gray-400 mr-2 flex-shrink-0" />
          {isOpen ? (
            <input
              ref={inputRef}
              type="text"
              className="flex-1 outline-none bg-transparent min-w-0"
              value={search}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder={currentLabel || placeholder}
              onClick={(e) => e.stopPropagation()}
              disabled={disabled}
            />
          ) : (
            <span className={`truncate ${currentLabel ? 'text-gray-900' : 'text-gray-400'}`}>
              {currentLabel || placeholder}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          {currentLabel && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X size={16} />
            </button>
          )}
          <ChevronDown
            size={18}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {isOpen && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-gray-500 text-sm text-center">
              {allowCustom && search ? (
                <span>
                  Premi Invio per usare "<strong>{search}</strong>"
                </span>
              ) : (
                <span>Nessun risultato per "{search}"</span>
              )}
            </div>
          ) : (
            filteredOptions.map((option, index) => (
              <div
                key={option.value}
                data-option
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  index === highlightedIndex
                    ? 'bg-blue-100 text-blue-900'
                    : option.value === value
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-gray-900 hover:bg-gray-100'
                }`}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {highlightMatch(option.label)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
