import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal } from './common/Modal';
import { Input } from './common/Input';
import { Button } from './common/Button';
import { RequisitiPassword } from './RequisitiPassword';
import { authService } from '../services/auth.service';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';
import { passwordValida } from '../utils/password';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Cambio obbligatorio (password iniziale o assegnata da un amministratore):
   * il modale non si chiude finché la password non è cambiata.
   */
  obbligatorio?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose, obbligatorio = false }) => {
  const { user, refreshProfile, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const toast = useToast();

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrore(null);
  };

  const handleClose = () => {
    if (obbligatorio) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!passwordValida(newPassword, user?.email)) {
      setErrore('La nuova password non rispetta tutti i requisiti.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrore('La conferma non corrisponde alla nuova password.');
      return;
    }

    setErrore(null);
    setIsSubmitting(true);
    try {
      const result = await authService.changePassword(currentPassword, newPassword);
      toast.success(
        'Password aggiornata',
        result.altreSessioniRevocate > 0
          ? `Le altre ${result.altreSessioniRevocate} sessioni attive sono state disconnesse.`
          : 'La password è stata cambiata con successo.',
      );
      await refreshProfile();
      reset();
      onClose();
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setErrore(
        status === 401
          ? 'La password attuale non è corretta.'
          : getErrorMessage(error, 'Impossibile cambiare la password. Riprova.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confermaDiversa = confirmPassword.length > 0 && confirmPassword !== newPassword;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={obbligatorio ? 'Scegli una nuova password' : 'Cambia password'}
      closable={!obbligatorio}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {obbligatorio && (
          <div className="flex gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <ShieldAlert size={20} className="text-amber-600 flex-shrink-0" aria-hidden="true" />
            <p>
              Per proteggere i dati dello studio, prima di continuare scegli una password personale che rispetti
              i requisiti qui sotto. La password attuale è quella con cui hai appena effettuato l'accesso.
            </p>
          </div>
        )}
        <Input
          label="Password attuale *"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <Input
          label="Nuova password *"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          maxLength={128}
          autoComplete="new-password"
        />
        <RequisitiPassword password={newPassword} email={user?.email} />
        <Input
          label="Conferma nuova password *"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          maxLength={128}
          autoComplete="new-password"
        />
        {confermaDiversa && <p className="text-sm text-red-700">La conferma non corrisponde.</p>}
        {errore && (
          <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert">
            {errore}
          </p>
        )}
        <p className="text-sm text-gray-500">Dopo il cambio, le altre sessioni attive verranno disconnesse.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
          {obbligatorio ? (
            <Button type="button" variant="secondary" onClick={() => void logout()} disabled={isSubmitting}>
              Esci
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Annulla
            </Button>
          )}
          <Button
            type="submit"
            disabled={isSubmitting || !passwordValida(newPassword, user?.email) || newPassword !== confirmPassword}
          >
            {isSubmitting ? 'Salvataggio...' : 'Cambia password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
