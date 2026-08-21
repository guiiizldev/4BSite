import { Clock3, Plus, ReceiptText, RefreshCw, Users, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import LoadingBar from "@/components/Loading/LoadingBar";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import PageLayout from "@/layout/PageLayout";
import { productService, type ProductDto } from "@/services/api/productService";
import {
  restaurantService,
  type RestaurantTab,
  type RestaurantTabItem,
  type RestaurantTable,
} from "@/services/api/restaurantService";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const tableState = {
  available: { label: "Livre", className: "border-success/30 bg-success/10 text-success" },
  occupied: { label: "Ocupada", className: "border-warning/35 bg-warning/10 text-warning" },
  reserved: { label: "Reservada", className: "border-secondary/30 bg-secondary/10 text-secondary" },
  inactive: { label: "Inativa", className: "border-border-primary bg-bg-primary text-text-secondary" },
};

const itemStatus: Record<RestaurantTabItem["status"], string> = {
  pending: "Pendente",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

type Modal = "create-table" | "open-tab" | "tab" | null;

export default function RestaurantFloorPage() {
  const dialog = useStatusDialog();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [tab, setTab] = useState<RestaurantTab | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableName, setTableName] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [customerName, setCustomerName] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [tabNotes, setTabNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTables, nextProducts] = await Promise.all([
        restaurantService.listTables(),
        productService.list(),
      ]);
      setTables(nextTables);
      setProducts(nextProducts);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível carregar o salão.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    available: tables.filter((table) => table.status === "available").length,
    occupied: tables.filter((table) => table.status === "occupied").length,
    total: tables.reduce((sum, table) => sum + Number(table.total || 0), 0),
  }), [tables]);

  const chooseTable = async (table: RestaurantTable) => {
    setSelectedTable(table);
    if (!table.openTabId) {
      setCustomerName("");
      setGuestCount(1);
      setTabNotes("");
      setModal("open-tab");
      return;
    }
    try {
      setSaving(true);
      const details = await restaurantService.getTab(table.openTabId);
      setTab(details ?? null);
      setModal("tab");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível abrir a comanda.");
    } finally { setSaving(false); }
  };

  const createTable = async (event: FormEvent) => {
    event.preventDefault();
    if (!tableName.trim()) return;
    try {
      setSaving(true);
      await restaurantService.createTable(tableName.trim(), capacity);
      setModal(null);
      setTableName("");
      await load();
      Toast.success("Mesa criada com sucesso.");
    } catch (error) { Toast.error(error instanceof Error ? error.message : "Erro ao criar mesa."); }
    finally { setSaving(false); }
  };

  const openTab = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTable) return;
    try {
      setSaving(true);
      const details = await restaurantService.openTab(selectedTable.id, customerName.trim(), guestCount, tabNotes.trim());
      setTab(details ?? null);
      setModal("tab");
      await load();
      Toast.success("Comanda aberta.");
    } catch (error) { Toast.error(error instanceof Error ? error.message : "Erro ao abrir comanda."); }
    finally { setSaving(false); }
  };

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!tab || !productId) return;
    try {
      setSaving(true);
      const details = await restaurantService.addItem(tab.id, productId, quantity, itemNotes.trim());
      setTab(details ?? tab);
      setProductId("");
      setQuantity(1);
      setItemNotes("");
      await load();
      Toast.success("Item lançado na comanda.");
    } catch (error) { Toast.error(error instanceof Error ? error.message : "Erro ao lançar item."); }
    finally { setSaving(false); }
  };

  const changeItemStatus = async (itemId: string, status: RestaurantTabItem["status"]) => {
    if (!tab) return;
    try {
      const details = await restaurantService.updateItemStatus(tab.id, itemId, status);
      setTab(details ?? tab);
      await load();
    } catch (error) { Toast.error(error instanceof Error ? error.message : "Erro ao atualizar item."); }
  };

  const closeTab = async () => {
    if (!tab) return;
    const confirmed = await dialog.confirm(`Encerrar a comanda #${tab.number} no valor de ${money.format(tab.total)}?`, {
      confirmLabel: "Encerrar comanda",
      cancelLabel: "Voltar",
      confirmIntent: "success",
    });
    if (!confirmed) return;
    try {
      setSaving(true);
      await restaurantService.closeTab(tab.id);
      setModal(null);
      setTab(null);
      await load();
      Toast.success("Comanda encerrada e mesa liberada.");
    } catch (error) { Toast.error(error instanceof Error ? error.message : "Erro ao encerrar comanda."); }
    finally { setSaving(false); }
  };

  return (
    <PageLayout size="wide" className="py-5 lg:py-7">
      <PageHeader
        title="Salão e comandas"
        description="Acompanhe mesas, consumo e andamento dos pedidos em tempo real."
        action={<div className="flex gap-2"><button onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-primary bg-bg-light px-4 text-sm font-semibold"><RefreshCw size={16} /> Atualizar</button><button onClick={() => setModal("create-table")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-white"><Plus size={16} /> Nova mesa</button></div>}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Mesas livres" value={counts.available} />
        <Metric label="Mesas ocupadas" value={counts.occupied} />
        <Metric label="Total em aberto" value={money.format(counts.total)} />
      </div>

      {loading ? <div className="flex min-h-64 items-center justify-center"><LoadingBar /></div> : tables.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-secondary bg-bg-light p-10 text-center"><ReceiptText className="mx-auto mb-3 text-accent" size={34} /><h2 className="text-lg font-bold">Configure seu salão</h2><p className="mt-1 text-sm text-text-secondary">Crie a primeira mesa para começar a abrir comandas.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tables.map((table) => {
            const state = tableState[table.status] ?? tableState.inactive;
            return <button key={table.id} onClick={() => void chooseTable(table)} disabled={table.status === "inactive" || saving} className="rounded-2xl border border-border-primary bg-bg-light p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md disabled:opacity-50">
              <div className="flex items-start justify-between gap-3"><div><span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Mesa</span><h2 className="mt-1 text-xl font-bold">{table.name}</h2></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${state.className}`}>{state.label}</span></div>
              <div className="mt-5 flex items-center justify-between text-sm text-text-secondary"><span className="inline-flex items-center gap-1.5"><Users size={15} /> {table.guestCount ?? table.capacity} pessoas</span>{table.openTabNumber ? <span>#{table.openTabNumber}</span> : null}</div>
              {table.openTabId ? <div className="mt-3 border-t border-border-primary pt-3"><p className="truncate text-sm font-medium">{table.customerName || "Consumidor"}</p><div className="mt-1 flex justify-between text-sm"><span className="inline-flex items-center gap-1 text-text-secondary"><Clock3 size={14} /> Em atendimento</span><strong>{money.format(table.total)}</strong></div></div> : <p className="mt-3 border-t border-border-primary pt-3 text-sm font-semibold text-success">Toque para abrir comanda</p>}
            </button>;
          })}
        </div>
      )}

      {modal === "create-table" && <ModalShell title="Nova mesa" onClose={() => setModal(null)}><form onSubmit={createTable} className="space-y-4"><Field label="Nome ou número"><input value={tableName} onChange={(e) => setTableName(e.target.value)} maxLength={80} required className="input-food" placeholder="Ex.: 01, Varanda 2" /></Field><Field label="Capacidade"><input type="number" min={1} max={100} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} required className="input-food" /></Field><Submit saving={saving}>Criar mesa</Submit></form></ModalShell>}
      {modal === "open-tab" && selectedTable && <ModalShell title={`Abrir comanda — Mesa ${selectedTable.name}`} onClose={() => setModal(null)}><form onSubmit={openTab} className="space-y-4"><Field label="Cliente (opcional)"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input-food" placeholder="Consumidor" /></Field><Field label="Quantidade de pessoas"><input type="number" min={1} max={999} value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))} className="input-food" /></Field><Field label="Observações"><textarea value={tabNotes} onChange={(e) => setTabNotes(e.target.value)} className="input-food min-h-20" /></Field><Submit saving={saving}>Abrir comanda</Submit></form></ModalShell>}
      {modal === "tab" && tab && <ModalShell wide title={`Comanda #${tab.number} — Mesa ${tab.tableName}`} onClose={() => setModal(null)}><div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-bg-primary p-3 text-sm"><div><span className="text-text-secondary">Cliente</span><strong className="block">{tab.customerName}</strong></div><div><span className="text-text-secondary">Total</span><strong className="block text-lg text-accent">{money.format(tab.total)}</strong></div></div><form onSubmit={addItem} className="grid gap-3 rounded-xl border border-border-primary p-3 sm:grid-cols-[1fr_100px]" ><Field label="Produto"><select value={productId} onChange={(e) => setProductId(e.target.value)} required className="input-food"><option value="">Selecione do catálogo</option>{products.map((product) => <option key={product.id} value={product.id}>{product.productName} — R$ {product.productSalePrice}</option>)}</select></Field><Field label="Quantidade"><input type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="input-food" /></Field><div className="sm:col-span-2"><Field label="Observação do item"><input value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} className="input-food" placeholder="Ex.: sem cebola" /></Field></div><div className="sm:col-span-2"><Submit saving={saving}>Adicionar à comanda</Submit></div></form><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{tab.items.length === 0 ? <p className="py-6 text-center text-sm text-text-secondary">Nenhum item lançado.</p> : tab.items.map((item) => <div key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-primary p-3 ${item.status === "cancelled" ? "opacity-50" : ""}`}><div><strong>{item.quantity}× {item.productName}</strong><p className="text-xs text-text-secondary">{money.format(item.quantity * item.unitPrice)} {item.notes ? `· ${item.notes}` : ""}</p></div><select value={item.status} onChange={(e) => void changeItemStatus(item.id, e.target.value as RestaurantTabItem["status"])} className="rounded-lg border border-border-primary bg-bg-light px-2 py-1.5 text-xs">{Object.entries(itemStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div><button onClick={() => void closeTab()} disabled={saving || tab.items.length === 0} className="mt-4 h-11 w-full rounded-xl bg-secondary font-semibold text-white disabled:opacity-50">Encerrar e liberar mesa — {money.format(tab.total)}</button></ModalShell>}
      {dialog.Dialog}
      <style>{`.input-food{width:100%;border:1px solid var(--color-border-primary);border-radius:.75rem;background:var(--color-bg-light);padding:.7rem .8rem;color:var(--color-text-primary);outline:none}.input-food:focus{border-color:var(--color-accent)}`}</style>
    </PageLayout>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-border-primary bg-bg-light p-4"><p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-semibold"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Submit({ saving, children }: { saving: boolean; children: ReactNode }) { return <button type="submit" disabled={saving} className="h-11 w-full rounded-xl bg-secondary px-4 font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : children}</button>; }
function ModalShell({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) { return <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true"><div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-border-primary bg-bg-light p-5 shadow-2xl ${wide ? "max-w-3xl" : "max-w-md"}`}><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} className="rounded-lg p-2 hover:bg-bg-primary" aria-label="Fechar"><X size={18} /></button></div>{children}</div></div>; }
