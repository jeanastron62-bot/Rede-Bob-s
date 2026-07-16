import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface CancelWithTimerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}

const TIMER_SECONDS = 10;

export function CancelWithTimerModal({ open, onClose, onConfirm }: CancelWithTimerModalProps) {
  const [notes, setNotes] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(TIMER_SECONDS);
    const interval = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, [open]);

  const handleClose = () => { setNotes(''); onClose(); };
  const handleConfirm = () => { onConfirm(notes.trim()); handleClose(); };

  return (
    <Modal open={open} onClose={handleClose} title="Cancelar pedido">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutral-400">Esta ação é irreversível e fica registrada na auditoria.</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" className="h-20 w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none" />
        <Button variant="danger" size="lg" disabled={!notes.trim() || secondsLeft > 0} onClick={handleConfirm}>{secondsLeft > 0 ? `Aguarde ${secondsLeft}s...` : 'Confirmar cancelamento'}</Button>
      </div>
    </Modal>
  );
}
