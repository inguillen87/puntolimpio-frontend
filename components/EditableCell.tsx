import React, { useState, useEffect, useRef } from 'react';

interface EditableCellProps {
  value: string | number;
  onSave: (newValue: string | number) => Promise<void>;
  type?: 'text' | 'number';
  className?: string;
  ariaLabel?: string;
}

const EditableCell: React.FC<EditableCellProps> = ({ value, onSave, type = 'text', className = '', ariaLabel }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    // Trim string values before comparing/saving
    const finalValue = typeof currentValue === 'string' ? currentValue.trim() : currentValue;
    const originalValue = typeof value === 'string' ? value.trim() : value;
    
    if (finalValue === originalValue || isLoading) {
      setIsEditing(false);
      setCurrentValue(value); // Revert to original prop value if no change
      return;
    }
    
    setIsLoading(true);
    try {
      await onSave(finalValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
      // Revert on error
      setCurrentValue(value); 
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };
  
  const handleBlur = () => {
    handleSave();
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={currentValue}
        onChange={(e) => setCurrentValue(type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        className={`w-full min-w-20 px-1 py-0.5 border border-blue-500 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
        aria-label={ariaLabel || `Editar valor ${value}`}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded px-1 py-0.5 transition-colors duration-200 block min-h-[22px] ${className}`}
      aria-label={`Valor actual ${value}, haz clic para editar`}
      title="Haz clic para editar"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(true); }}
    >
      {value}
    </span>
  );
};

export default EditableCell;
