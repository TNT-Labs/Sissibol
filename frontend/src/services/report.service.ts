import { api } from './api';

export type TipoReport = 'scadenze' | 'pagamenti' | 'clienti';
export type FormatoReport = 'xlsx' | 'pdf';

/**
 * Scarica un report generato dal server (Excel o PDF).
 *
 * Il file arriva come Blob; il nome è quello indicato dal server. Gli errori
 * (es. troppe righe per un PDF) arrivano anch'essi come Blob: il messaggio
 * JSON viene estratto perché l'interfaccia possa mostrarlo.
 */
export async function scaricaReport(
  tipo: TipoReport,
  formato: FormatoReport,
  filtri: Record<string, string | number | undefined>,
): Promise<void> {
  try {
    const risposta = await api.get<Blob>(`/report/${tipo}`, {
      params: { ...filtri, formato },
      responseType: 'blob',
      timeout: 300_000,
    });
    const disposizione = String(risposta.headers['content-disposition'] ?? '');
    const nome = /filename="([^"]+)"/.exec(disposizione)?.[1] ?? `report-${tipo}.${formato}`;
    salva(risposta.data, nome);
  } catch (errore) {
    const dati = (errore as { response?: { data?: unknown } }).response?.data;
    if (dati instanceof Blob) {
      try {
        (errore as { response: { data: unknown } }).response.data = JSON.parse(await dati.text());
      } catch {
        // Corpo non JSON: resta il messaggio generico.
      }
    }
    throw errore;
  }
}

function salva(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Dopo un attimo: alcuni browser leggono l'URL in modo asincrono.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
