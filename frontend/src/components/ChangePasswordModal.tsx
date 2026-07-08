import React, { useState } from 'react';
import { Modal } from './common/Modal';
import { Input } from './common/Input';
import { Button } from './common/Button';
import { authService } from '../services/auth.service';
import { useToast } from '../context/ToastContext';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (newPassword.length < 6) {
      toast.error('Errore', 'La nuova password deve avere almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Errore', 'La conferma non corrisponde alla nuova password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authService.changePassword(currentPassword, newPassword);
      toast.success(
        'Password aggiornata',
        result.altreSessioniRevocate > 0
          ? `Le altre ${result.altreSessioniRevocate} sessioni attive sono state disconnesse.`
          : 'La password è stata cambiata con successo.',
      );
      handleClose();
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const message = status === 401
        ? 'La password attuale non è corretta.'
        : 'Impossibile cambiare la password. Riprova.';
      toast.error('Errore', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cambia password">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          minLength={6}
          autoComplete="new-password"
        />
        <Input
          label="Conferma nuova password *"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
        <p className="text-sm text-gray-500">
          Dopo il cambio, le altre sessioni attive verranno disconnesse.
        </p>
        <div className="flex justify-end space-x-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Annulla
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Salvataggio...' : 'Cambia password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
