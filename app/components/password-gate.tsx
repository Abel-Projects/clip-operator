"use client";

import { FormEvent } from "react";

type PasswordGateProps = {
  password: string;
  error?: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function PasswordGate({
  password,
  error,
  onPasswordChange,
  onSubmit
}: PasswordGateProps) {
  return (
    <main className="opus-page opus-page-auth">
      <form className="opus-auth" onSubmit={onSubmit}>
        <h1>Password required</h1>
        <input
          className="opus-input"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="current-password"
          autoFocus
          aria-label="Password"
        />
        {error ? <p className="opus-error">{error}</p> : null}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Continue
        </button>
      </form>
    </main>
  );
}
