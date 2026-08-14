/**
 * Arquivo: src/pages/Admin/LicenseDetailsPage.tsx
 * Objetivo: apresenta o estado da licença comercial e os avisos legais do software base.
 * Entradas esperadas: não recebe props; renderiza conteúdo estático sobre termos de uso do projeto.
 */

import { BadgeCheck, BookMarked, Copyright, Scale } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";

export default function LicenseDetailsPage() {
  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Licença 4Byts"
        description="Status do produto, integração comercial e avisos legais."
      />

      <section className="card overflow-hidden">
        <div className="border-b border-border-primary bg-gradient-to-r from-secondary/8 via-bg-light to-accent/8 px-4 py-4 md:px-5">
          <h2 className="text-lg font-semibold text-text-primary">Licença comercial 4Byts</h2>
          <p className="mt-1 text-sm text-text-secondary">
            A ativação pelo painel 4Byts será exibida aqui após a integração com a central de licenças.
          </p>
        </div>

        <div className="space-y-3 p-4 md:p-5">
          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Scale size={16} className="text-accent" />
              Modelo de licenciamento
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              O 4Byts PDV será vinculado à empresa e ao plano contratado. A licença determinará
              vencimento, módulos disponíveis e limite de instalações.
            </p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Copyright size={16} className="text-accent" />
              Software de origem
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              O 4Byts PDV contém software derivado do projeto Hórus PDV, distribuído sob a licença
              MIT. O texto integral está incluído no arquivo LICENSE da distribuição.
            </p>
            <div className="mt-3 space-y-1 text-sm text-text-secondary">
              <p>
                Autor: <strong className="text-text-primary">Flávio Oliveira</strong>
              </p>
              <p>
                GitHub:{" "}
                <a
                  href="https://github.com/flaviooliveira-code"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  github.com/flaviooliveira-code
                </a>
              </p>
              <p>
                LinkedIn:{" "}
                <a
                  href="https://www.linkedin.com/in/fladoliveira"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  linkedin.com/in/fladoliveira
                </a>
              </p>
            </div>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <BookMarked size={16} className="text-accent" />
              Desenvolvimento 4Byts
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Identidade visual, central de licenças, infraestrutura, suporte, integrações e novos
              módulos são mantidos e evoluídos pela 4Byts.
            </p>
          </article>

          <article className="rounded-xl border border-success/30 bg-success/10 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-success">
              <BadgeCheck size={16} />
              Integração em preparação
            </p>
            <p className="mt-2 text-sm text-success">
              Esta versão de desenvolvimento ainda não exige ativação. Ela não deve ser utilizada
              como versão comercial até a conexão com o painel 4Byts estar concluída.
            </p>
          </article>
        </div>
      </section>
    </PageLayout>
  );
}
