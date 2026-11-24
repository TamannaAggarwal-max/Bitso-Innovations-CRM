import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound, LockKeyhole, Mail } from "lucide-react";
import api from "./api";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const { data } = await api.post("/auth/request-reset", { email });
      setMessage(data.message || "If an account exists for that email, a reset link will be sent.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not request a reset link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="forgot-password-title">
        <div className="brand-mark">B</div>
        <div className="eyebrow">BITSO INNOVATIONS</div>
        <h1 id="forgot-password-title">Reset your password</h1>
        <p className="muted">Enter your account email and we’ll send a secure reset link.</p>
        <form onSubmit={submit}>
          <label htmlFor="reset-email">Email address</label>
          <input id="reset-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} required />
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="notice" role="status">{message}</div>}
          <button className="primary full" disabled={busy}>
            <Mail size={16} /> {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <div className="login-foot">
          <button type="button" className="link-btn" onClick={() => navigate("/login")}><ArrowLeft size={14} /> Back to sign in</button>
        </div>
      </section>
    </div>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      setError("This reset link is invalid or incomplete. Request a new one to continue.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("Password must be no more than 72 bytes.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post("/auth/confirm-reset", { token, newPassword: password });
      setMessage(data.message || "Your password has been reset. You can now sign in.");
      navigate("/reset-password", { replace: true });
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not reset your password. Request a new reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="new-password-title">
        <div className="brand-mark">B</div>
        <div className="eyebrow">BITSO INNOVATIONS</div>
        <h1 id="new-password-title">Choose a new password</h1>
        <p className="muted">Use at least 10 characters. Reset links expire after 30 minutes.</p>
        <form onSubmit={submit}>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={72} required />
          <label htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={72} required />
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="notice" role="status">{message}</div>}
          {!message && <button className="primary full" disabled={busy || !token}>
            <KeyRound size={16} /> {busy ? "Updating…" : "Reset password"}
          </button>}
        </form>
        <div className="login-foot"><LockKeyhole size={14} /> Your password is stored securely.</div>
        <div className="login-foot">
          <button type="button" className="link-btn" onClick={() => navigate("/login")}>Back to sign in</button>
          {!token && <button type="button" className="link-btn" onClick={() => navigate("/forgot-password")}>Request a new link</button>}
          {message && <button type="button" className="link-btn" onClick={() => navigate("/login")}>Continue to sign in</button>}
        </div>
      </section>
    </div>
  );
}