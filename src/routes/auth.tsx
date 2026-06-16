import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Month Check" },
      { name: "description", content: "Acesse sua conta para conferir suas finanças mensais." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/conferencia" });
    });
  }, [navigate]);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/conferencia",
      });
      if (result.error) throw result.error;
      if (!result.redirected) {
        navigate({ to: "/conferencia" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar com Google");
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/conferencia" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/conferencia" },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/conferencia" });
        else setInfo("Conta criada! Verifique seu e-mail para confirmar.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="neu-raised w-full max-w-md rounded-3xl p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo height={64} className="mb-3" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Month Check</h1>
          <p className="mt-1 text-sm text-muted-foreground">Conferência financeira mensal</p>
        </div>

        <div className="neu-inset mb-6 flex rounded-full p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all ${mode === "login" ? "neu-raised-sm text-primary" : "text-muted-foreground"}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all ${mode === "signup" ? "neu-raised-sm text-primary" : "text-muted-foreground"}`}
          >
            Cadastrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="neu-inset w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="voce@exemplo.com"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Senha
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="neu-inset w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {info && <p className="text-sm text-primary">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="neu-pressable w-full rounded-xl bg-gradient-to-r from-primary to-secondary py-3 text-sm font-semibold text-black shadow-lg disabled:opacity-60"
          >
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="neu-pressable flex w-full items-center justify-center gap-2 rounded-xl bg-background py-3 text-sm font-semibold text-foreground disabled:opacity-60"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Entrar com Google
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Voltar
          </Link>
        </p>
      </div>
    </div>
  );
}
