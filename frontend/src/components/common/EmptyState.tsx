import React from 'react';
import { Inbox, Search, FileX, Users, Car, Calendar, CreditCard } from 'lucide-react';
import { Button } from './Button';

type EmptyStateType = 'generic' | 'search' | 'filter' | 'clienti' | 'veicoli' | 'scadenze' | 'pagamenti';

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const icons: Record<EmptyStateType, React.ElementType> = {
  generic: Inbox,
  search: Search,
  filter: FileX,
  clienti: Users,
  veicoli: Car,
  scadenze: Calendar,
  pagamenti: CreditCard,
};

const defaultContent: Record<EmptyStateType, { title: string; description: string }> = {
  generic: {
    title: 'Nessun dato disponibile',
    description: 'Non ci sono elementi da visualizzare al momento.',
  },
  search: {
    title: 'Nessun risultato trovato',
    description: 'Prova a modificare i termini di ricerca o rimuovi alcuni filtri.',
  },
  filter: {
    title: 'Nessun elemento corrisponde ai filtri',
    description: 'Prova a modificare i filtri selezionati per visualizzare più risultati.',
  },
  clienti: {
    title: 'Nessun cliente presente',
    description: 'Inizia aggiungendo il tuo primo cliente per gestire i suoi veicoli e scadenze.',
  },
  veicoli: {
    title: 'Nessun veicolo presente',
    description: 'Aggiungi un veicolo per iniziare a tracciare le scadenze dei bolli.',
  },
  scadenze: {
    title: 'Nessuna scadenza presente',
    description: 'Le scadenze verranno generate automaticamente quando aggiungi veicoli.',
  },
  pagamenti: {
    title: 'Nessun pagamento registrato',
    description: 'Registra un pagamento quando un bollo viene pagato.',
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'generic',
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const Icon = icons[type];
  const content = defaultContent[type];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon size={32} className="text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2 text-center">
        {title || content.title}
      </h3>
      <p className="text-sm text-gray-500 text-center max-w-md mb-6">
        {description || content.description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
