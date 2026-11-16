'use client';

import React, { useState } from 'react';

export interface PasswordFieldProps {
  id: string;
  name?: string;
  label?: string;
  hideLabel?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  error?: string;
}

export function PasswordField({
  id,
  name,
  label = 'Password',
  hideLabel = false,
  value,
  onChange,
  placeholder = 'Password',
  required = false,
  minLength,
  maxLength,
  autoComplete = 'current-password',
  disabled = false,
  className = '',
  inputClassName = '',
  error,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className={
            hideLabel
              ? 'sr-only'
              : 'block text-[13px] font-bold text-ink mb-1'
          }
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={id}
          name={name || id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`w-full min-h-[44px] pl-3.5 pr-12 rounded-[12px] bg-cream border text-ink text-[14px] font-bold transition focus:outline-none focus:ring-2 focus:ring-leaf/50 disabled:opacity-60 disabled:cursor-not-allowed ${
            error ? 'border-tomato ring-1 ring-tomato' : 'border-leaf/20'
          } ${inputClassName}`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          disabled={disabled}
          className="absolute right-0 top-0 bottom-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted hover:text-ink focus:outline-none focus:text-ink transition px-2.5 rounded-r-[12px]"
        >
          {showPassword ? (
            /* Inline SVG Eye-Off Icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="w-5 h-5 pointer-events-none"
            >
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            /* Inline SVG Eye Icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="w-5 h-5 pointer-events-none"
            >
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {error && <p className="mt-1 text-[12px] font-bold text-tomato">{error}</p>}
    </div>
  );
}
