/**
 * Arquivo: src/pages/Admin/AboutPdvPage.tsx
 * Objetivo: apresenta informações institucionais do projeto (história, autoria, licença e visão futura).
 * Entradas esperadas: não recebe props; exibe conteúdo institucional e atribuições legais.
 */

import { BookOpenText, Code2, Rocket } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";

export default function AboutPdvPage() {
  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Sobre PDV"
        description="Conheça o produto, sua evolução e a tecnologia por trás do 4Byts PDV."
      />

      <section className="card overflow-hidden">
        <div className="border-b border-border-primary bg-gradient-to-r from-secondary/8 via-bg-light to-accent/8 px-4 py-4 md:px-5">
          <h2 className="text-lg font-semibold text-text-primary">4Byts PDV</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Gestão de vendas e operação de caixa com a simplicidade da 4Byts.
          </p>
        </div>

        <div className="space-y-4 p-4 md:p-5">
          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <BookOpenText size={16} className="text-accent" />
              Nossa evolução
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              O 4Byts PDV evolui continuamente integrado ao ecossistema de produtos, licenças,
              suporte e atualizações da 4Byts.
            </p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Code2 size={16} className="text-accent" />
              Objetivo do produto
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Entregar uma operação confiável e simples, com vendas, estoque, caixa, clientes e
              relatórios conectados à plataforma 4Byts.
            </p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Rocket size={16} className="text-accent" />
              Evolução contínua
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Novos módulos, integrações e melhorias de segurança serão distribuídos continuamente
              para clientes com licença ativa.
            </p>
          </article>
        </div>
      </section>
    </PageLayout>
  );
}
