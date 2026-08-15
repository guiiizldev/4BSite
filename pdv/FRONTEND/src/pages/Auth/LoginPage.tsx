/**
 * Arquivo: src/pages/Auth/LoginPage.tsx
 * Objetivo: renderiza autenticação do usuário e inicialização da sessão no frontend.
 * Entradas esperadas: recebe callbacks de sucesso e navegação para cadastro/recuperação.
 */
import { KeyRound, LogIn } from "lucide-react";
import { useState } from "react";
import useRecaptchaV3 from "@/hooks/Security/useRecaptchaV3";
import AuthLayout from "./AuthLayout";
import { EmailField, FeedbackMessage, PasswordField } from "./AuthFields";
import LoadingButton from "@/components/Loading/LoadingButton";
import type { AuthActionResult } from "./types";

type LoginPageProps = {
  onLogin: (
    email: string,
    password: string,
    remember: boolean,
    recaptchaToken?: string,
    licenseKey?: string,
  ) => Promise<AuthActionResult>;
  onOpenForgotPassword: () => void;
  onOpenRegister: () => void;
};

export default function LoginPage({
  onLogin,
  onOpenForgotPassword,
  onOpenRegister,
}: LoginPageProps) {
  const { executeRecaptcha, isRecaptchaConfigured } = useRecaptchaV3();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [licenseKey, setLicenseKey] = useState("");
  const [reactivationRequired, setReactivationRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<AuthActionResult | null>(null);

  const runRecaptcha = () =>
    isRecaptchaConfigured ? executeRecaptcha("login") : Promise.resolve("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim() || (reactivationRequired && !licenseKey.trim())) {
      setFeedback({
        success: false,
        message: reactivationRequired
          ? "Informe a chave da licença para reativar esta instalação."
          : "Informe e-mail e senha para entrar.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const recaptchaToken = await runRecaptcha();
      const result = await onLogin(email, password, remember, recaptchaToken, licenseKey);
      if (!result.success && result.message.includes("Ative o PDV novamente")) {
        setReactivationRequired(true);
        setFeedback({
          success: false,
          message: "Esta máquina precisa ser reativada. Informe abaixo a chave da licença e tente novamente.",
        });
      } else {
        setFeedback(result);
      }
    } catch (error) {
      setFeedback(
        toErrorResult(
          error,
          "Não foi possível concluir a validação de segurança.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Bem-vindo de volta!"
      description="Use seu e-mail e senha para acessar o painel."
    >
      <EmailField value={email} onChange={setEmail} onEnter={handleLogin} />
      <PasswordField
        label="Senha"
        value={password}
        show={showPassword}
        onChange={setPassword}
        onToggle={() => setShowPassword((current) => !current)}
        onEnter={handleLogin}
      />

      {reactivationRequired && (
        <label className="block rounded-xl border border-accent/30 bg-accent/5 p-3">
          <span className="mb-1 block text-sm font-semibold text-text-primary">
            Chave da licença para reativação
          </span>
          <div className="relative">
            <KeyRound
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-accent"
            />
            <input
              type="text"
              className="input-field w-full pl-10 font-mono uppercase"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value.toUpperCase())}
              placeholder="4B-PDV-XXXXXX-XXXXXX"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleLogin();
              }}
            />
          </div>
          <small className="mt-2 block text-xs text-text-secondary">
            Use a mesma chave vinculada à empresa. Se o IP mudou, uma nova aprovação será solicitada.
          </small>
        </label>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Manter sessão conectada
        </label>
        <button
          type="button"
          onClick={onOpenForgotPassword}
          disabled={isSubmitting}
          className="text-left text-sm font-semibold text-secondary hover:text-hover-secondary disabled:opacity-60 sm:text-right"
        >
          Esqueci minha senha
        </button>
      </div>

      <LoadingButton
        type="button"
        onClick={handleLogin}
        isLoading={isSubmitting}
        loadingLabel="Entrando..."
        className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2"
      >
        <LogIn size={16} />
        {reactivationRequired ? "Reativar e entrar" : "Entrar"}
      </LoadingButton>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-text-secondary">
        <span>Não tem uma conta?</span>
        <button
          type="button"
          onClick={onOpenRegister}
          disabled={isSubmitting}
          className="font-semibold text-secondary transition hover:text-hover-secondary disabled:opacity-60"
        >
          Criar cadastro
        </button>
      </div>

      <FeedbackMessage result={feedback} />
    </AuthLayout>
  );
}

function toErrorResult(error: unknown, fallback: string): AuthActionResult {
  return {
    success: false,
    message: error instanceof Error ? error.message : fallback,
  };
}
