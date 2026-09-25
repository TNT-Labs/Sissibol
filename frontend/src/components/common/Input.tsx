import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  // Etichetta collegata al campo: lettori di schermo e clic sull'etichetta.
  const idGenerato = useId();
  const idCampo = id ?? idGenerato;
  const idErrore = `${idCampo}-errore`;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={idCampo} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <input
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idErrore : undefined}
        className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${className}`}
        {...props}
      />
      {error && (
        <p id={idErrore} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
