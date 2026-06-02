import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { T, serif, sans, cardStyle } from "../theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("E-mail ou senha inválidos.");
    // sucesso: o useAuth do Dashboard detecta a sessão e troca de tela.
  };

  const inp = {
    background: T.bg, border: `1px solid ${T.line}`, borderRadius: 9, color: T.ink,
    padding: "11px 12px", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ ...sans, background: T.bg, color: T.ink, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ ...cardStyle, width: "min(380px, 100%)", padding: 28 }}>
        <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: T.terra, marginBottom: 6, fontWeight: 600 }}>Casa Senses · E-commerce B2C</div>
        <h1 style={{ ...serif, fontSize: 26, margin: "0 0 20px", fontWeight: 600 }}>Acesso ao Dashboard</h1>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, color: T.inkSoft }}>E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={{ ...inp, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, color: T.inkSoft }}>Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ ...inp, marginTop: 4 }} />
          </label>
          {error && <div style={{ fontSize: 12.5, color: T.terra, fontWeight: 600 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, marginTop: 4 }}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
