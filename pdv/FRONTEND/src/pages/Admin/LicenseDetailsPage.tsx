import { useEffect, useState } from "react";
import { BadgeCheck, BookMarked, RefreshCw, Scale, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";
import { licenseService, type LicenseDto } from "@/services/api/licenseService";

const statusLabels: Record<string, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  expired: "Vencida",
  revoked: "Revogada",
};

function formatDate(value?: string | null) {
  if (!value) return "Sem vencimento";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function LicenseDetailsPage() {
  const [license, setLicense] = useState<LicenseDto>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    licenseService.get()
      .then((data) => setLicense(data))
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Não foi possível consultar a licença."))
      .finally(() => setLoading(false));
  }, []);

  const isActive = license?.status === "active";

  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader title="Licença 4Byts" description="Status do produto e informações do plano contratado." />

      <section className="card overflow-hidden">
        <div className="border-b border-border-primary bg-gradient-to-r from-secondary/8 via-bg-light to-accent/8 px-4 py-4 md:px-5">
          <h2 className="text-lg font-semibold text-text-primary">Licença comercial 4Byts</h2>
          <p className="mt-1 text-sm text-text-secondary">Informações sincronizadas com a central de licenças da 4Byts.</p>
        </div>

        <div className="space-y-3 p-4 md:p-5">
          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-border-primary bg-bg-primary p-4 text-sm text-text-secondary">
              <RefreshCw size={16} className="animate-spin text-accent" /> Consultando licença...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {license && (
            <article className={`rounded-xl border p-4 ${isActive ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}`}>
              <p className={`inline-flex items-center gap-2 text-sm font-semibold ${isActive ? "text-success" : "text-danger"}`}>
                {isActive ? <BadgeCheck size={17} /> : <ShieldAlert size={17} />}
                {statusLabels[license.status] ?? license.status}
              </p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="block text-text-secondary">Produto</span><strong className="text-text-primary">{license.product}</strong></div>
                <div><span className="block text-text-secondary">Plano</span><strong className="text-text-primary">{license.plan}</strong></div>
                <div><span className="block text-text-secondary">Instalações permitidas</span><strong className="text-text-primary">{license.maxDevices}</strong></div>
                <div><span className="block text-text-secondary">Vencimento</span><strong className="text-text-primary">{formatDate(license.expiresAt)}</strong></div>
              </div>
              <p className="mt-4 text-xs text-text-secondary">Validada em {formatDate(license.lastValidatedAt)}</p>
            </article>
          )}

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary"><Scale size={16} className="text-accent" /> Modelo de licenciamento</p>
            <p className="mt-2 text-sm text-text-secondary">O 4Byts PDV é vinculado à empresa e ao plano contratado. A licença determina vencimento, módulos disponíveis e limite de instalações.</p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary"><BookMarked size={16} className="text-accent" /> Desenvolvimento 4Byts</p>
            <p className="mt-2 text-sm text-text-secondary">Identidade visual, central de licenças, infraestrutura, suporte, integrações e novos módulos são mantidos e evoluídos pela 4Byts.</p>
          </article>
        </div>
      </section>
    </PageLayout>
  );
}
