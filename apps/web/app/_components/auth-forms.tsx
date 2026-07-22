"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  completeAdministratorTotpSetup,
  login,
  registerAccount,
  requestPasswordReset,
  resetPassword,
  unlockGate,
  verifyAdministratorSecondFactor,
  type FormState
} from "../actions";

const initialState: FormState = { status: "idle" };

function Notice({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p className={`form-notice ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>;
}

function SubmitButton({ idle, pending }: { idle: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return <button className="primary submit" type="submit" disabled={isPending}>{isPending ? pending : idle}</button>;
}

export function GateForm() {
  const [state, action] = useActionState(unlockGate, initialState);
  return <form action={action} className="combination-form">
    <fieldset>
      <legend>Enter the founding combination</legend>
      <label><span>Month</span><input name="month" inputMode="numeric" maxLength={2} placeholder="MM" aria-label="Combination month" required /></label>
      <span className="dial-mark" aria-hidden="true">•</span>
      <label><span>Day</span><input name="day" inputMode="numeric" maxLength={2} placeholder="DD" aria-label="Combination day" required /></label>
      <span className="dial-mark" aria-hidden="true">•</span>
      <label className="year-dial"><span>Year</span><input name="year" inputMode="numeric" maxLength={4} placeholder="YYYY" aria-label="Combination year" required /></label>
    </fieldset>
    <Notice state={state} />
    <SubmitButton idle="Turn the key" pending="Opening…" />
  </form>;
}

export function LoginForm({ next = "", resetComplete = false }: { next?: string; resetComplete?: boolean }) {
  const [state, action] = useActionState(login, initialState);
  return <form action={action} className="auth-form">
    {resetComplete && <p className="form-notice success" role="status">Your password has been changed. Sign in with your new password.</p>}
    <Notice state={state} />
    <input type="hidden" name="next" value={next} />
    <label><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <label><span>Password</span><input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label>
    <div className="form-row form-row-end"><a href="/forgot-password">Forgot password?</a></div>
    <SubmitButton idle="Sign in" pending="Signing in…" />
  </form>;
}

export function RegistrationForm() {
  const [state, action] = useActionState(registerAccount, initialState);
  return <form action={action} className="auth-form">
    <Notice state={state} />
    <label><span>Full name on the alumni roster</span><input name="fullName" type="text" autoComplete="name" maxLength={120} required /></label>
    <label><span>Email address on the alumni roster</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <label><span>Create password</span><input name="password" type="password" autoComplete="new-password" maxLength={128} aria-describedby="password-help" required /></label>
    <p className="field-help" id="password-help">Use at least 12 characters with uppercase, lowercase, and a number.</p>
    <label><span>Confirm password</span><input name="passwordConfirm" type="password" autoComplete="new-password" maxLength={128} required /></label>
    <SubmitButton idle="Request access" pending="Submitting…" />
  </form>;
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initialState);
  return <form action={action} className="auth-form">
    <Notice state={state} />
    <label><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
    <SubmitButton idle="Send reset link" pending="Sending…" />
  </form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, initialState);
  return <form action={action} className="auth-form">
    <Notice state={state} />
    <input type="hidden" name="token" value={token} />
    <label><span>New password</span><input name="password" type="password" autoComplete="new-password" maxLength={128} required /></label>
    <p className="field-help">Use at least 12 characters with uppercase, lowercase, and a number.</p>
    <label><span>Confirm new password</span><input name="passwordConfirm" type="password" autoComplete="new-password" maxLength={128} required /></label>
    <SubmitButton idle="Change password" pending="Changing…" />
  </form>;
}

export function VerifySecondFactorForm() {
  const [state, action] = useActionState(verifyAdministratorSecondFactor, initialState);
  return <form action={action} className="auth-form">
    <Notice state={state} />
    <label><span>Authenticator or recovery code</span><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={29} required /></label>
    <SubmitButton idle="Verify identity" pending="Verifying…" />
  </form>;
}

export function CompleteTotpSetupForm() {
  const [state, action] = useActionState(completeAdministratorTotpSetup, initialState);
  return <form action={action} className="auth-form">
    <Notice state={state} />
    <label><span>Six-digit verification code</span><input name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} required /></label><SubmitButton idle="Enable two-factor authentication" pending="Verifying…" />
  </form>;
}
