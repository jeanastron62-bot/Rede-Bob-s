import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

const REASONS = ['Endereço não localizado', 'Cliente ausente / não responde', 'Troco incorreto', 'Acidente / imprevisto', 'Erro de montagem do pedido'];

interface ReportProblemModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (problem: string) => void;
}

export function ReportProblemModal({ open, onClose, onSubmit }: ReportProblemModalProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [freeText, setFreeText] = useState('');

  const handleClose = () => { setSelectedReason(''); setFreeText(''); onClose(); };
  const handleSubmit = () => {
    const problem = [selectedReason, freeText].filter(Boolean).join(' — ');
    if (!problem) return;
    onSubmit(problem);
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Reportar problema">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {REASONS.map((r) => (<button key={r} onClick={() => setSelectedReason(r)} className={`h-12 rounded-xl px-4 text-left text-sm font-medium ${selectedReason === r ? 'bg-primary text-white' : 'bg-neutral-900/50 border border-neutral-850 text-neutral-300'}`}>{r}</button>))}
        </div>
        <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Detalhes adicionais (opcional)" className="h-20 w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none" />
        <Button size="lg" disabled={!selectedReason && !freeText} onClick={handleSubmit}>Enviar</Button>
      </div>
    </Modal>
  );
}
