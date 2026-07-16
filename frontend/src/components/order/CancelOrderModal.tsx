import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface CancelOrderModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}

export function CancelOrderModal({ open, onClose, onConfirm }: CancelOrderModalProps) {
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);

  const handleClose = () => {
    setNotes('');
    setConfirming(false);
    onClose();
  };

  const handleFinalConfirm = () => {
    onConfirm(notes.trim());
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Cancelar pedido">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-white/70">Esta ação é irreversível e fica registrada na auditoria. Descreva o motivo.</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" className="h-20 w-full resize-none rounded-lg border border-white/10 bg-bg-elevated p-3 text-sm text-white placeholder-white/40 focus:border-primary focus:outline-none" />
        {!confirming ? (
          <Button variant="danger" size="lg" disabled={!notes.trim()} onClick={() => setConfirming(true)}>Cancelar pedido</Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm font-semibold text-red-400">Toque novamente para confirmar. Isso não pode ser desfeito.</p>
            <Button variant="danger" size="lg" onClick={handleFinalConfirm}>Confirmar cancelamento</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
